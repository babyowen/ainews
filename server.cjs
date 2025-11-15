require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // 增加请求体大小限制
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 关键词列表
app.get('/api/keywords', async (req, res) => {
  const [rows] = await pool.query('SELECT DISTINCT keyword FROM scored_news WHERE keyword IS NOT NULL AND keyword != ""');
  res.json(rows.map(r => r.keyword));
});

// 关键词的可用prompt列表
app.get('/api/keyword-prompts', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { keyword } = req.query;
    const configPath = path.join(__dirname, 'config/keyword-prompts.json');
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'keyword-prompts configuration not found' });
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    const json = JSON.parse(content);
    if (!keyword || !json.keywords || !json.keywords[keyword]) {
      return res.json([]);
    }
    const prompts = json.keywords[keyword].prompts || [];
    const result = prompts.map(p => ({ id: p.id, name: p.name, description: p.description, isDefault: !!p.isDefault }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load keyword prompts', details: err.message });
  }
});

// 新闻来源网站列表
app.get('/api/news-sources', async (req, res) => {
  const [rows] = await pool.query('SELECT DISTINCT source FROM scored_news WHERE source IS NOT NULL AND source != ""');
  res.json(rows.map(r => r.source));
});

// 关键词摘要
app.get('/api/summary-news', async (req, res) => {
  const { keyword, date, startDate, endDate, page = 1, pageSize = 20, sortBy = 'date', order = 'desc' } = req.query;
  let sql = 'SELECT * FROM summary_news WHERE 1=1';
  const params = [];
  if (keyword) {
    sql += ' AND keyword = ?';
    params.push(keyword);
  }
  if (date) {
    sql += ' AND date = ?';
    params.push(date);
  } else {
    if (startDate) {
      sql += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND date <= ?';
      params.push(endDate);
    }
  }
  sql += ` ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`;
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  // 调试用，打印SQL和参数
  console.log('summary-news SQL:', sql, params);
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// 新闻列表
app.get('/api/scored-news', async (req, res) => {
  const { keyword, date, startDate, endDate, source, minScore, maxScore, includeUnscored, scores, page = 1, pageSize = 20, sortBy = 'date', order = 'desc' } = req.query;
  
  // 添加详细调试日志
  console.log('=== /api/scored-news 调试信息 ===');
  console.log('Node环境:', process.env.NODE_ENV || 'development');
  console.log('数据库配置:', {
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  });
  console.log('请求参数:', {
    keyword, date, startDate, endDate, source, 
    minScore, maxScore, includeUnscored, scores,
    page, pageSize, sortBy, order
  });
  
  // 特别调试江苏省国资委
  if (keyword === '江苏省国资委') {
    console.log('=== 江苏省国资委特别调试 ===');
    console.log('关键词原始值:', keyword);
    console.log('关键词长度:', keyword.length);
    console.log('关键词字节:', Buffer.from(keyword, 'utf8'));
    console.log('URL编码:', encodeURIComponent(keyword));
    
    // 测试不同的关键词匹配方式
    try {
      const [testRows] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE keyword LIKE ?', [`%${keyword}%`]);
      console.log('LIKE查询结果:', testRows[0].count);
      
      const [exactRows] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE keyword = ?', [keyword]);
      console.log('精确匹配结果:', exactRows[0].count);
      
      const [allKeywords] = await pool.query('SELECT DISTINCT keyword FROM scored_news WHERE keyword IS NOT NULL LIMIT 10');
      console.log('数据库中的关键词样本:', allKeywords.map(r => r.keyword));
    } catch (err) {
      console.error('测试查询失败:', err);
    }
  }
  
  let where = 'WHERE 1=1';
  const params = [];
  if (keyword) {
    where += ' AND keyword = ?';
    params.push(keyword);
  }
  if (source) {
    where += ' AND source = ?';
    params.push(source);
  }
  
  // 优先处理多分数筛选
  if (scores && Array.isArray(scores) && scores.length > 0) {
    const numericScores = scores.map(Number).filter(n => !isNaN(n));
    if (numericScores.length > 0) {
      where += ` AND score IN (?)`;
      params.push(numericScores);
    }
  } 
  // 否则，使用旧的范围筛选逻辑
  else if (minScore !== undefined || maxScore !== undefined || includeUnscored === 'true') {
    let scoreConditions = [];
    
    // 如果有分数范围筛选
    if (minScore !== undefined && maxScore !== undefined) {
      scoreConditions.push('(score >= ? AND score <= ?)');
      params.push(minScore, maxScore);
    } else if (minScore !== undefined) {
      scoreConditions.push('score >= ?');
      params.push(minScore);
    } else if (maxScore !== undefined) {
      scoreConditions.push('score <= ?');
      params.push(maxScore);
    }
    
    // 如果包含未评分
    if (includeUnscored === 'true') {
      scoreConditions.push('(score IS NULL OR score = "")');
    }
    
    // 组合分数条件 - 只有当有条件时才添加
    if (scoreConditions.length > 0) {
      where += ' AND (' + scoreConditions.join(' OR ') + ')';
    }
  }
  
  if (date) {
    where += ' AND fetchdate = ?';
    params.push(date);
  } else {
    if (startDate) {
      where += ' AND fetchdate >= ?';
      params.push(startDate);
    }
    if (endDate) {
      where += ' AND fetchdate <= ?';
      params.push(endDate);
    }
  }
  
  console.log('生成的WHERE条件:', where);
  console.log('参数数组:', params);
  
  // 先测试基础查询 - 不带分数筛选
  if (date === '2024-10-12') {
    console.log('=== 基础数据检查 ===');
    try {
      const [basicRows] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE fetchdate = ?', [date]);
      console.log('该日期总数据量:', basicRows[0].count);
      
      // 检查score字段的实际值
      const [scoreCheck] = await pool.query('SELECT score, COUNT(*) as count FROM scored_news WHERE fetchdate = ? GROUP BY score', [date]);
      console.log('score字段分布:', scoreCheck);
      
      // 检查具体的未评分数据
      const [unscoredCheck] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE fetchdate = ? AND (score IS NULL OR score = "")', [date]);
      console.log('未评分数据量:', unscoredCheck[0].count);
      
      // 检查字段类型和编码
      const [fieldInfo] = await pool.query("SHOW COLUMNS FROM scored_news LIKE 'score'");
      console.log('score字段信息:', fieldInfo);
      
    } catch (err) {
      console.error('基础数据检查错误:', err);
    }
  }
  
  // 查询总数
  const countSql = `SELECT COUNT(*) as count FROM scored_news ${where}`;
  console.log('统计SQL:', countSql);
  
  const [countRows] = await pool.query(countSql, params);
  const total = countRows[0].count;
  console.log('查询到的总数:', total);
  
  // 查询分页数据
  let sql = `SELECT * FROM scored_news ${where} ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`;
  const pageParams = [...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)];
  console.log('数据查询SQL:', sql);
  console.log('分页参数:', pageParams);
  
  const [rows] = await pool.query(sql, pageParams);
  console.log('查询到的数据条数:', rows.length);
  
  // 如果查询结果为空但应该有数据，进行详细调试
  if (total === 0 && date === '2024-10-12' && includeUnscored === 'true') {
    console.log('=== 空结果调试 ===');
    // 分步测试每个条件
    const [testDate] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE fetchdate = ?', [date]);
    console.log('仅日期条件结果:', testDate[0].count);
    
    const [testScore] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE (score IS NULL OR score = "")', []);
    console.log('仅分数条件结果:', testScore[0].count);
    
    const [testBoth] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE fetchdate = ? AND (score IS NULL OR score = "")', [date]);
    console.log('组合条件结果:', testBoth[0].count);
  }
  
  console.log('=== 调试信息结束 ===');
  
  res.json({ rows, total });
});

// 抓取量分布
app.get('/api/news-source-stats', async (req, res) => {
  const { keyword, startDate, endDate, page = 1, pageSize = 20, sortBy = 'date', order = 'desc' } = req.query;
  let sql = 'SELECT * FROM news_source_stats WHERE 1=1';
  const params = [];
  if (keyword) {
    sql += ' AND keyword = ?';
    params.push(keyword);
  }
  if (startDate) {
    sql += ' AND date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND date <= ?';
    params.push(endDate);
  }
  sql += ` ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`;
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// 网站信息
app.get('/api/news-websites', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM news_websites');
  res.json(rows);
});

// 修改评分页面 - 获取新闻数据
app.get('/api/score-edit', async (req, res) => {
  const { keyword, date } = req.query;
  
  console.log('=== /api/score-edit 调试信息 ===');
  console.log('请求参数:', { keyword, date });
  
  if (!keyword || !date) {
    return res.status(400).json({ error: '关键词和日期参数必填' });
  }
  
  try {
    const sql = `
      SELECT 
        id,
        title,
        content,
        link,
        source,
        score,
        keyword,
        search_keyword,
        fetchdate
      FROM scored_news 
      WHERE keyword = ? AND fetchdate = ?
      ORDER BY id ASC
    `;
    
    console.log('执行SQL:', sql);
    console.log('参数:', [keyword, date]);
    
    const [rows] = await pool.query(sql, [keyword, date]);
    console.log('查询结果数量:', rows.length);
    
    if (rows.length > 0) {
      console.log('第一条数据示例:', rows[0]);
    } else {
      // 如果没有数据，检查是否有相似的数据
      const [testRows] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE keyword = ?', [keyword]);
      console.log('该关键词总数据量:', testRows[0].count);
      
      const [dateRows] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE fetchdate = ?', [date]);
      console.log('该日期总数据量:', dateRows[0].count);
    }
    
    console.log('=== 调试信息结束 ===');
    
    res.json(rows);
  } catch (error) {
    console.error('获取评分修改数据失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 更新新闻评分
app.post('/api/update-score', async (req, res) => {
  const { newsId, score } = req.body;
  
  console.log('=== /api/update-score 调试信息 ===');
  console.log('请求体:', { newsId, score });
  
  if (!newsId || score === undefined) {
    return res.status(400).json({ error: '新闻ID和评分参数必填' });
  }
  
  // 验证评分值
  if (score !== '' && score !== null && (score < 0 || score > 5)) {
    return res.status(400).json({ error: '评分必须在0-5之间' });
  }
  
  try {
    const sql = 'UPDATE scored_news SET score = ? WHERE id = ?';
    console.log('执行SQL:', sql);
    console.log('参数:', [score, newsId]);
    
    const [result] = await pool.query(sql, [score, newsId]);
    console.log('更新结果:', result);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '未找到对应的新闻记录' });
    }
    
    console.log('=== 调试信息结束 ===');
    
    res.json({ 
      success: true, 
      message: '评分更新成功',
      affectedRows: result.affectedRows 
    });
  } catch (error) {
    console.error('更新评分失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 低分段分布统计（改为所有分数段分布统计）
app.get('/api/low-score-distribution', async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT score, keyword, sourceapi, COUNT(*) as count
       FROM scored_news
       WHERE fetchdate BETWEEN ? AND ?
       GROUP BY score, keyword, sourceapi
       ORDER BY score, count DESC`,
      [startDate, endDate]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 数据调试接口 - 用于检查特定日期的数据情况
app.get('/api/debug-data', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date parameter is required' });
  }
  
  try {
    // 检查该日期的总数据量
    const [totalRows] = await pool.query(
      'SELECT COUNT(*) as count FROM scored_news WHERE DATE(fetchdate) = ?',
      [date]
    );
    
    // 检查score字段的分布情况
    const [scoreDistribution] = await pool.query(
      'SELECT score, COUNT(*) as count FROM scored_news WHERE DATE(fetchdate) = ? GROUP BY score ORDER BY score',
      [date]
    );
    
    // 检查未评分数据 (NULL)
    const [nullScoreRows] = await pool.query(
      'SELECT COUNT(*) as count FROM scored_news WHERE DATE(fetchdate) = ? AND score IS NULL',
      [date]
    );
    
    // 检查空字符串评分数据
    const [emptyScoreRows] = await pool.query(
      'SELECT COUNT(*) as count FROM scored_news WHERE DATE(fetchdate) = ? AND score = ""',
      [date]
    );
    
    // 检查未评分数据（NULL或空字符串）
    const [unscoredRows] = await pool.query(
      'SELECT COUNT(*) as count FROM scored_news WHERE DATE(fetchdate) = ? AND (score IS NULL OR score = "")',
      [date]
    );
    
    // 获取几条样本数据
    const [sampleRows] = await pool.query(
      'SELECT id, title, score, keyword, source, fetchdate FROM scored_news WHERE DATE(fetchdate) = ? LIMIT 10',
      [date]
    );
    
    res.json({
      date,
      totalCount: totalRows[0].count,
      scoreDistribution,
      nullScoreCount: nullScoreRows[0].count,
      emptyScoreCount: emptyScoreRows[0].count,
      unscoredCount: unscoredRows[0].count,
      sampleData: sampleRows
    });
  } catch (err) {
    console.error('Debug data error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// 获取周报新闻列表
app.get('/api/weekly-news', async (req, res) => {
  const { keyword, startDate, endDate, minScore, includeAll } = req.query;
  
  if (!keyword || !startDate || !endDate) {
    return res.status(400).json({ error: 'keyword, startDate, and endDate are required' });
  }
  
  try {
    let sql = `SELECT id, title, content, short_summary, source, fetchdate, score, link, keyword, search_keyword, wordcount 
       FROM scored_news 
       WHERE keyword = ? AND DATE(fetchdate) BETWEEN ? AND ?`;
    
    const params = [keyword, startDate, endDate];
    
    // 根据参数添加分数筛选条件
    if (minScore && !includeAll) {
      sql += ` AND (score IS NOT NULL AND score != '' AND CAST(score AS DECIMAL) >= ?)`;
      params.push(minScore);
    } else if (!includeAll) {
      // 默认只显示3分以上的新闻
      sql += ` AND (score IS NOT NULL AND score != '' AND CAST(score AS DECIMAL) >= 3)`;
    }
    
    sql += ` ORDER BY CAST(score AS DECIMAL) DESC, fetchdate DESC`;
    
    console.log('Weekly news SQL:', sql);
    console.log('Parameters:', params);
    
    const [rows] = await pool.query(sql, params);
    
    console.log('Query result count:', rows.length);
    
    res.json(rows);
  } catch (err) {
    console.error('Weekly news query error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// 预览修改周报消息（不实际调用大模型）
app.post('/api/preview-modify-message', async (req, res) => {
  const { originalReport, modifyRequest, keyword, startDate, endDate } = req.body;
  
  if (!originalReport || !modifyRequest || !keyword || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    // 读取提示词
    const promptsPath = path.join(__dirname, 'config/prompts.md');
    const promptsContent = fs.readFileSync(promptsPath, 'utf-8');
    
    // 解析modify system prompt和modify user prompt
    const modifySystemPromptMatch = promptsContent.match(/## Modify System Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
    const modifyUserPromptMatch = promptsContent.match(/## Modify User Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
    
    const modifySystemPrompt = modifySystemPromptMatch ? modifySystemPromptMatch[1].trim() : '';
    const modifyUserPromptTemplate = modifyUserPromptMatch ? modifyUserPromptMatch[1].trim() : '';
    
    // 替换修改用户提示词中的变量
    const finalModifyUserPrompt = modifyUserPromptTemplate
      .replace('{originalReport}', originalReport)
      .replace('{modifyRequest}', modifyRequest)
      .replace('{keyword}', keyword)
      .replace('{startDate}', startDate)
      .replace('{endDate}', endDate);
    
    // 计算字数和Token估算
    const totalContent = modifySystemPrompt + finalModifyUserPrompt;
    const totalChars = totalContent.length;
    
    // Token估算函数 (基于DeepSeek官方标准: 1个中文字符≈0.6token, 1个英文字符≈0.3token)
    const estimateTokens = (text) => {
      if (!text) return 0;
      const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
      const otherChars = text.length - chineseChars - englishChars;
      return Math.ceil(chineseChars * 0.6 + englishChars * 0.3 + otherChars * 0.5);
    };
    
    // 返回完整的消息预览，不调用大模型
    res.json({
      preview: true,
      debug: {
        systemPrompt: modifySystemPrompt,
        userPrompt: finalModifyUserPrompt,
        model: 'deepseek-reasoner (modify)',
        totalChars,
        estimatedTokens: estimateTokens(totalContent)
      }
    });
  } catch (err) {
    console.error('Preview modify message error:', err);
    res.status(500).json({ error: 'Failed to preview modify message', details: err.message });
  }
});

// 修改周报（实际调用大模型）
app.post('/api/modify-report', async (req, res) => {
  const { originalReport, modifyRequest, keyword, startDate, endDate, stream = false } = req.body;
  
  if (!originalReport || !modifyRequest || !keyword || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  try {
    // 直接使用DeepSeek R1 API
    const fs = require('fs');
    const path = require('path');
    
    // 读取提示词
    const promptsPath = path.join(__dirname, 'config/prompts.md');
    const promptsContent = fs.readFileSync(promptsPath, 'utf-8');
    
    // 解析modify system prompt和modify user prompt
    const modifySystemPromptMatch = promptsContent.match(/## Modify System Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
    const modifyUserPromptMatch = promptsContent.match(/## Modify User Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
    
    const modifySystemPrompt = modifySystemPromptMatch ? modifySystemPromptMatch[1].trim() : '';
    const modifyUserPromptTemplate = modifyUserPromptMatch ? modifyUserPromptMatch[1].trim() : '';
    
    // 替换修改用户提示词中的变量
    const finalModifyUserPrompt = modifyUserPromptTemplate
      .replace('{originalReport}', originalReport)
      .replace('{modifyRequest}', modifyRequest)
      .replace('{keyword}', keyword)
      .replace('{startDate}', startDate)
      .replace('{endDate}', endDate);

    // Token估算函数 (基于DeepSeek官方标准: 1个中文字符≈0.6token, 1个英文字符≈0.3token)
    const estimateTokens = (text) => {
      if (!text) return 0;
      const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
      const otherChars = text.length - chineseChars - englishChars;
      return Math.ceil(chineseChars * 0.6 + englishChars * 0.3 + otherChars * 0.5);
    };

    // 计算字数和Token估算
    const totalContent = modifySystemPrompt + finalModifyUserPrompt;
    const totalChars = totalContent.length;
    
    if (stream) {
      // 设置流式响应头
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // 发送初始调试信息
      const debugInfo = {
        systemPrompt: modifySystemPrompt,
        userPrompt: finalModifyUserPrompt,
        model: 'deepseek-reasoner (modify)',
        totalChars,
        estimatedTokens: estimateTokens(totalContent)
      };
      
      res.write(`data: ${JSON.stringify({ type: 'debug', data: debugInfo })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'status', message: '🔗 正在连接DeepSeek R1...' })}\n\n`);
      
      // 调试：检查API密钥
      console.log('DeepSeek API Key:', process.env.DEEPSEEK_API_KEY ? `${process.env.DEEPSEEK_API_KEY.substring(0, 10)}...` : 'NOT FOUND');
      console.log('DeepSeek API Request - Token estimate:', estimateTokens(totalContent));
      
      // 调用DeepSeek API with stream
      console.log('Calling DeepSeek API...');
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-reasoner',
          messages: [
            {
              role: 'system',
              content: modifySystemPrompt
            },
            {
              role: 'user',
              content: finalModifyUserPrompt
            }
          ],
          temperature: 0.7,
          stream: true
        })
      });
      
      if (!response.ok) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: `DeepSeek API error: ${response.status} ${response.statusText}` })}\n\n`);
        res.end();
        return;
      }
      
      res.write(`data: ${JSON.stringify({ type: 'status', message: '🤖 DeepSeek R1 开始修改...' })}\n\n`);
      
      let fullReport = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write(`data: ${JSON.stringify({ type: 'done', report: fullReport })}\n\n`);
              res.end();
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                fullReport += content;
                res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
              } else if (parsed.choices && parsed.choices[0]?.delta?.reasoning_content) {
                // DeepSeek R1的思考过程
                const reasoning = parsed.choices[0].delta.reasoning_content;
                res.write(`data: ${JSON.stringify({ type: 'reasoning', content: reasoning })}\n\n`);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } else {
      // 非流式模式，保持原有逻辑
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-reasoner',
          messages: [
            {
              role: 'system',
              content: modifySystemPrompt
            },
            {
              role: 'user',
              content: finalModifyUserPrompt
            }
          ],
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const report = data.choices?.[0]?.message?.content || '修改周报失败';
      
      // 返回结果，包含调试信息
      res.json({ 
        report,
        debug: {
          systemPrompt: modifySystemPrompt,
          userPrompt: finalModifyUserPrompt,
          model: 'deepseek-reasoner (modify)',
          totalChars,
          estimatedTokens: estimateTokens(totalContent)
        }
      });
    }
  } catch (err) {
    console.error('Modify report error:', err);
    let errorMessage = '⚠️ DeepSeek服务暂时不可用，请稍后重试';
    
    // 检查具体错误类型
    if (err.message.includes('API key') || err.message.includes('authentication')) {
      errorMessage = '⚠️ DeepSeek API密钥配置错误，请检查配置';
    } else if (err.message.includes('network') || err.message.includes('ENOTFOUND') || err.message.includes('timeout')) {
      errorMessage = '⚠️ 网络连接失败，请检查网络连接后重试';
    } else if (err.message.includes('rate limit') || err.message.includes('quota')) {
      errorMessage = '⚠️ DeepSeek API调用频率超限，请稍后重试';
    }
    
    if (stream) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'DeepSeek修改服务错误', message: errorMessage, details: err.message });
    }
  }
});

// 预览周报生成消息（不实际调用大模型）
app.post('/api/preview-report-message', async (req, res) => {
  const { keyword, startDate, endDate, selectedNews, userPrompt, summaryVersion } = req.body;
  
  if (!keyword || !startDate || !endDate || !selectedNews || selectedNews.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    // 读取标准提示词
    const promptsPath = path.join(__dirname, 'config/prompts.md');
    const promptsContent = fs.readFileSync(promptsPath, 'utf-8');
    
    // 解析system prompt和user prompt
    const systemPromptMatch = promptsContent.match(/## System Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
    const userPromptMatch = promptsContent.match(/## User Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
    
    const systemPrompt = systemPromptMatch ? systemPromptMatch[1].trim() : '';
    const userPromptTemplate = userPromptMatch ? userPromptMatch[1].trim() : '';
    
    // 拼接新闻内容
  const newsContent = selectedNews.map((news, index) => {
      const text = summaryVersion === 'short' ? (news.short_summary || news.content || '内容不详') : (news.content || news.short_summary || '内容不详');
      return `新闻${index + 1}标题:${news.title}\n新闻${index + 1}内容:${text}`;
    }).join('\n\n');
    
    // 替换用户提示词中的变量
    const finalUserPrompt = userPromptTemplate
      .replace('{keyword}', keyword)
      .replace('{startDate}', startDate)
      .replace('{endDate}', endDate)
      .replace('{news}', newsContent)
      .replace('{usertopic}', userPrompt || '无特别要求');
    
    // 计算字数和Token估算
    const totalContent = systemPrompt + finalUserPrompt;
    const totalChars = totalContent.length;
    
    // Token估算函数 (基于DeepSeek官方标准: 1个中文字符≈0.6token, 1个英文字符≈0.3token)
    const estimateTokens = (text) => {
      if (!text) return 0;
      const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
      const otherChars = text.length - chineseChars - englishChars;
      return Math.ceil(chineseChars * 0.6 + englishChars * 0.3 + otherChars * 0.5);
    };
    
    // 返回完整的消息预览，不调用大模型
    res.json({
      preview: true,
      debug: {
        systemPrompt,
        userPrompt: finalUserPrompt,
        newsCount: selectedNews.length,
        model: 'deepseek-reasoner',
        totalChars,
        estimatedTokens: estimateTokens(totalContent)
      }
    });
  } catch (err) {
    console.error('Preview report message error:', err);
    res.status(500).json({ error: 'Failed to preview message', details: err.message });
  }
});

// 生成周报（实际调用大模型）
app.post('/api/generate-report', async (req, res) => {
  const { keyword, startDate, endDate, selectedNews, userPrompt, promptId, stream = false, summaryVersion } = req.body;
  
  if (!keyword || !startDate || !endDate || !selectedNews || selectedNews.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  


  try {
    // 直接使用DeepSeek R1 API
    const fs = require('fs');
    const path = require('path');
    
    let systemPrompt = '';
    let userPromptTemplate = '';
    
    // 如果指定了promptId，使用关键词特定的prompt配置
    if (promptId) {
      try {
        const keywordPromptsPath = path.join(__dirname, 'config/keyword-prompts.json');
        const keywordPromptsContent = fs.readFileSync(keywordPromptsPath, 'utf-8');
        const keywordPrompts = JSON.parse(keywordPromptsContent);
        
        // 查找指定关键词的prompt配置
        const keywordConfig = keywordPrompts.keywords[keyword];
        if (keywordConfig && keywordConfig.prompts) {
          const selectedPrompt = keywordConfig.prompts.find(p => p.id === promptId);
          if (selectedPrompt) {
            systemPrompt = selectedPrompt.systemPrompt;
            userPromptTemplate = selectedPrompt.userPrompt;
            console.log(`使用关键词 ${keyword} 的自定义prompt配置 (ID: ${promptId})`);
          }
        }
      } catch (error) {
        console.warn('读取关键词prompt配置失败，使用默认配置:', error);
      }
    }
    
    // 如果没有找到关键词特定的prompt，使用默认配置
    if (!systemPrompt || !userPromptTemplate) {
      const promptsPath = path.join(__dirname, 'config/prompts.md');
      const promptsContent = fs.readFileSync(promptsPath, 'utf-8');
      
      // 解析system prompt和user prompt
      const systemPromptMatch = promptsContent.match(/## System Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
      const userPromptMatch = promptsContent.match(/## User Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
      
      systemPrompt = systemPromptMatch ? systemPromptMatch[1].trim() : '';
      userPromptTemplate = userPromptMatch ? userPromptMatch[1].trim() : '';
    }
    
    // 拼接新闻内容
    const newsContent = selectedNews.map((news, index) => {
      const text = summaryVersion === 'short' ? (news.short_summary || news.content || '内容不详') : (news.content || news.short_summary || '内容不详');
      return `新闻${index + 1}标题:${news.title}\n新闻${index + 1}内容:${text}`;
    }).join('\n\n');
    
    // 替换用户提示词中的变量
    const finalUserPrompt = userPromptTemplate
      .replace('{keyword}', keyword)
      .replace('{startDate}', startDate)
      .replace('{endDate}', endDate)
      .replace('{news}', newsContent)
      .replace('{usertopic}', userPrompt || '无特别要求');

    // Token估算函数 (基于DeepSeek官方标准: 1个中文字符≈0.6token, 1个英文字符≈0.3token)
    const estimateTokens = (text) => {
      if (!text) return 0;
      const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
      const otherChars = text.length - chineseChars - englishChars;
      return Math.ceil(chineseChars * 0.6 + englishChars * 0.3 + otherChars * 0.5);
    };

    // 计算字数和Token估算
    const totalContent = systemPrompt + finalUserPrompt;
    const totalChars = totalContent.length;
    
    if (stream) {
      // 设置流式响应头
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // 发送初始调试信息
      const debugInfo = {
        systemPrompt,
        userPrompt: finalUserPrompt,
        newsCount: selectedNews.length,
        model: 'deepseek-reasoner',
        totalChars,
        estimatedTokens: estimateTokens(totalContent)
      };
      
      res.write(`data: ${JSON.stringify({ type: 'debug', data: debugInfo })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'status', message: '🔗 正在连接DeepSeek R1...' })}\n\n`);
      
      // 调试：检查API密钥
      console.log('DeepSeek API Key:', process.env.DEEPSEEK_API_KEY ? `${process.env.DEEPSEEK_API_KEY.substring(0, 10)}...` : 'NOT FOUND');
      console.log('DeepSeek API Request - Token estimate:', estimateTokens(totalContent));
      console.log('Calling DeepSeek API...');
      
      // 创建AbortController用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
      
      try {
        // 调用DeepSeek API with stream
        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify({
            model: 'deepseek-reasoner',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: finalUserPrompt }
            ],
            temperature: 0.7,
            stream: true
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        console.log('DeepSeek API Response received, status:', response.status);
      
        if (!response.ok) {
        // 检查是否为token超限
        const text = await response.text();
        console.error('DeepSeek API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: text
        });
        if (text.includes('context length') || text.includes('token limit') || text.includes('maximum context')) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: '⚠️ 输入内容超出DeepSeek token限制，请减少新闻数量或内容长度' })}\n\n`);
          res.end();
          return;
        }
        res.write(`data: ${JSON.stringify({ type: 'error', message: `DeepSeek API error: ${response.status} ${response.statusText} - ${text}` })}\n\n`);
        res.end();
        return;
      }
      
      res.write(`data: ${JSON.stringify({ type: 'status', message: '🤖 DeepSeek R1 开始思考...' })}\n\n`);
      
      console.log('DeepSeek API Response OK, starting stream processing...');
      let fullReport = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let deepseekError = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write(`data: ${JSON.stringify({ type: 'done', report: fullReport })}\n\n`);
              res.end();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.error && (parsed.error.message?.includes('context length') || parsed.error.message?.includes('token limit') || parsed.error.message?.includes('maximum context'))) {
                // DeepSeek流式返回token超限
                res.write(`data: ${JSON.stringify({ type: 'error', message: '⚠️ 输入内容超出DeepSeek token限制，请减少新闻数量或内容长度' })}\n\n`);
                res.end();
                return;
              }
              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                fullReport += content;
                res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
              } else if (parsed.choices && parsed.choices[0]?.delta?.reasoning_content) {
                const reasoning = parsed.choices[0].delta.reasoning_content;
                res.write(`data: ${JSON.stringify({ type: 'reasoning', content: reasoning })}\n\n`);
              } else if (parsed.error) {
                deepseekError += parsed.error.message;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
      // 如果流式过程中 deepseekError 捕获到 token 超限
      if (deepseekError && (deepseekError.includes('context length') || deepseekError.includes('token limit') || deepseekError.includes('maximum context'))) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: '⚠️ 输入内容超出DeepSeek token限制，请减少新闻数量或内容长度' })}\n\n`);
        res.end();
        return;
      }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        console.error('DeepSeek API fetch error:', fetchError);
        if (fetchError.name === 'AbortError') {
          res.write(`data: ${JSON.stringify({ type: 'error', message: '⚠️ DeepSeek API请求超时，DeepSeek服务可能暂时不可用，请稍后重试或使用KIMI模型' })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', message: `⚠️ DeepSeek API连接失败，DeepSeek服务可能暂时不可用，请稍后重试或使用KIMI模型` })}\n\n`);
        }
        res.end();
        return;
      }
    } else {
      // 非流式模式
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-reasoner',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: finalUserPrompt }
          ],
          temperature: 0.7
        })
      });
      if (!response.ok) {
        const text = await response.text();
        if (text.includes('context length') || text.includes('token limit') || text.includes('maximum context')) {
          res.status(400).json({ 
            error: '输入内容超出DeepSeek token限制',
            message: '⚠️ 输入内容超出DeepSeek token限制，请减少新闻数量或内容长度'
          });
          return;
        }
        throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (data.error && (data.error.message?.includes('context length') || data.error.message?.includes('token limit') || data.error.message?.includes('maximum context'))) {
        res.status(400).json({ 
          error: '输入内容超出DeepSeek token限制',
          message: '⚠️ 输入内容超出DeepSeek token限制，请减少新闻数量或内容长度'
        });
        return;
      }
      const report = data.choices?.[0]?.message?.content || '生成周报失败';
      res.json({ 
        report,
        debug: {
          systemPrompt,
          userPrompt: finalUserPrompt,
          newsCount: selectedNews.length,
          model: 'deepseek-reasoner',
          totalChars,
          estimatedTokens: estimateTokens(totalContent)
        }
      });
    }
  } catch (err) {
    console.error('Generate report error:', err);
    let errorMessage = '⚠️ DeepSeek服务暂时不可用，请稍后重试或使用其他模型';
    
    // 检查具体错误类型
    if (err.message.includes('API key') || err.message.includes('authentication')) {
      errorMessage = '⚠️ DeepSeek API密钥配置错误，请检查配置';
    } else if (err.message.includes('network') || err.message.includes('ENOTFOUND') || err.message.includes('timeout')) {
      errorMessage = '⚠️ 网络连接失败，请检查网络连接后重试';
    } else if (err.message.includes('rate limit') || err.message.includes('quota')) {
      errorMessage = '⚠️ DeepSeek API调用频率超限，请稍后重试';
    }
    
    if (stream) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'DeepSeek服务错误', message: errorMessage, details: err.message });
    }
  }
});

// 硅基流动生成周报API
app.post('/api/generate-siliconflow-report', async (req, res) => {
  const { keyword, startDate, endDate, selectedNews, userPrompt, promptId, stream = false, summaryVersion } = req.body;
  
  if (!keyword || !startDate || !endDate || !selectedNews || selectedNews.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const fs = require('fs');
    const path = require('path');
    
    let systemPrompt = '';
    let userPromptTemplate = '';
    
    // 如果指定了promptId，使用关键词特定的prompt配置
    if (promptId) {
      try {
        const keywordPromptsPath = path.join(__dirname, 'config/keyword-prompts.json');
        const keywordPromptsContent = fs.readFileSync(keywordPromptsPath, 'utf-8');
        const keywordPrompts = JSON.parse(keywordPromptsContent);
        
        // 查找指定关键词的prompt配置
        const keywordConfig = keywordPrompts.keywords[keyword];
        if (keywordConfig && keywordConfig.prompts) {
          const selectedPrompt = keywordConfig.prompts.find(p => p.id === promptId);
          if (selectedPrompt) {
            systemPrompt = selectedPrompt.systemPrompt;
            userPromptTemplate = selectedPrompt.userPrompt;
            console.log(`硅基流使用关键词 ${keyword} 的自定义prompt配置 (ID: ${promptId})`);
          }
        }
      } catch (error) {
        console.warn('硅基流读取关键词prompt配置失败，使用默认配置:', error);
      }
    }
    
    // 如果没有找到关键词特定的prompt，使用默认配置
    if (!systemPrompt || !userPromptTemplate) {
      const promptsPath = path.join(__dirname, 'config/prompts.md');
      const promptsContent = fs.readFileSync(promptsPath, 'utf-8');
      
      // 解析system prompt和user prompt
      const systemPromptMatch = promptsContent.match(/## System Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
      const userPromptMatch = promptsContent.match(/## User Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
      
      systemPrompt = systemPromptMatch ? systemPromptMatch[1].trim() : '';
      userPromptTemplate = userPromptMatch ? userPromptMatch[1].trim() : '';
    }
    
    // 拼接新闻内容
    const newsContent = selectedNews.map((news, index) => {
      const text = summaryVersion === 'short' ? (news.short_summary || news.content || '内容不详') : (news.content || news.short_summary || '内容不详');
      return `新闻${index + 1}标题:${news.title}\n新闻${index + 1}内容:${text}`;
    }).join('\n\n');
    
    // 替换用户提示词中的变量
    const finalUserPrompt = userPromptTemplate
      .replace('{keyword}', keyword)
      .replace('{startDate}', startDate)
      .replace('{endDate}', endDate)
      .replace('{news}', newsContent)
      .replace('{usertopic}', userPrompt || '无特别要求');

    // Token估算函数
    const estimateTokens = (text) => {
      if (!text) return 0;
      const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
      const otherChars = text.length - chineseChars - englishChars;
      return Math.ceil(chineseChars * 0.6 + englishChars * 0.3 + otherChars * 0.5);
    };

    // 计算字数和Token估算
    const totalContent = systemPrompt + finalUserPrompt;
    const totalChars = totalContent.length;
    
    if (stream) {
      // 设置流式响应头
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // 发送初始调试信息
      const debugInfo = {
        systemPrompt,
        userPrompt: finalUserPrompt,
        newsCount: selectedNews.length,
        model: '硅基-deepseek-r1',
        totalChars,
        estimatedTokens: estimateTokens(totalContent)
      };
      
      res.write(`data: ${JSON.stringify({ type: 'debug', data: debugInfo })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'status', message: '🔗 正在连接硅基流动...' })}\n\n`);
      
      // 调试：检查API密钥
      console.log('SiliconFlow API Key:', process.env.SILICONFLOW_API_KEY ? `${process.env.SILICONFLOW_API_KEY.substring(0, 10)}...` : 'NOT FOUND');
      console.log('SiliconFlow API Request - Token estimate:', estimateTokens(totalContent));
      console.log('Calling SiliconFlow API...');
      
      // 创建AbortController用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
      
      try {
        // 调用硅基流动API with stream
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`
          },
          body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-R1',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: finalUserPrompt }
          ],
          temperature: 0.7,
          stream: true
        }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        console.log('SiliconFlow API Response received, status:', response.status);
      
        if (!response.ok) {
          // 检查是否为token超限
          const text = await response.text();
          console.error('SiliconFlow API Error Response:', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: text
          });
          if (text.includes('context length') || text.includes('token limit') || text.includes('maximum context')) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: '⚠️ 输入内容超出硅基流动 token限制，请减少新闻数量或内容长度' })}\n\n`);
            res.end();
            return;
          }
          res.write(`data: ${JSON.stringify({ type: 'error', message: `硅基流动 API error: ${response.status} ${response.statusText} - ${text}` })}\n\n`);
          res.end();
          return;
        }
        
        res.write(`data: ${JSON.stringify({ type: 'status', message: '🤖 硅基流动 DeepSeek-R1 开始思考...' })}\n\n`);
        
        console.log('SiliconFlow API Response OK, starting stream processing...');
        let fullReport = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let siliconflowError = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                res.write(`data: ${JSON.stringify({ type: 'done', report: fullReport })}\n\n`);
                res.end();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.error && (parsed.error.message?.includes('context length') || parsed.error.message?.includes('token limit') || parsed.error.message?.includes('maximum context'))) {
                  // 硅基流动流式返回token超限
                  res.write(`data: ${JSON.stringify({ type: 'error', message: '⚠️ 输入内容超出硅基流动 token限制，请减少新闻数量或内容长度' })}\n\n`);
                  res.end();
                  return;
                }
                if (parsed.choices && parsed.choices[0]?.delta?.content) {
                  const content = parsed.choices[0].delta.content;
                  fullReport += content;
                  res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
                } else if (parsed.choices && parsed.choices[0]?.delta?.reasoning_content) {
                  const reasoning = parsed.choices[0].delta.reasoning_content;
                  res.write(`data: ${JSON.stringify({ type: 'reasoning', content: reasoning })}\n\n`);
                } else if (parsed.error) {
                  siliconflowError += parsed.error.message;
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
        // 如果流式过程中 siliconflowError 捕获到 token 超限
        if (siliconflowError && (siliconflowError.includes('context length') || siliconflowError.includes('token limit') || siliconflowError.includes('maximum context'))) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: '⚠️ 输入内容超出硅基流动 token限制，请减少新闻数量或内容长度' })}\n\n`);
          res.end();
          return;
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        console.error('SiliconFlow API fetch error:', fetchError);
        if (fetchError.name === 'AbortError') {
          res.write(`data: ${JSON.stringify({ type: 'error', message: '⚠️ 硅基流动 API请求超时，硅基流动服务可能暂时不可用，请稍后重试或使用其他模型' })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', message: `⚠️ 硅基流动 API连接失败，硅基流动服务可能暂时不可用，请稍后重试或使用其他模型` })}\n\n`);
        }
        res.end();
        return;
      }
    } else {
      // 非流式模式
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-R1',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: finalUserPrompt }
          ],
          temperature: 0.7
        })
      });
      if (!response.ok) {
        const text = await response.text();
        if (text.includes('context length') || text.includes('token limit') || text.includes('maximum context')) {
          res.status(400).json({ 
            error: '输入内容超出硅基流动 token限制',
            message: '⚠️ 输入内容超出硅基流动 token限制，请减少新闻数量或内容长度'
          });
          return;
        }
        throw new Error(`SiliconFlow API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (data.error && (data.error.message?.includes('context length') || data.error.message?.includes('token limit') || data.error.message?.includes('maximum context'))) {
        res.status(400).json({ 
          error: '输入内容超出硅基流动 token限制',
          message: '⚠️ 输入内容超出硅基流动 token限制，请减少新闻数量或内容长度'
        });
        return;
      }
      const report = data.choices?.[0]?.message?.content || '生成周报失败';
      res.json({ 
        report,
        debug: {
          systemPrompt,
          userPrompt: finalUserPrompt,
          newsCount: selectedNews.length,
          model: '硅基-deepseek-r1',
          totalChars,
          estimatedTokens: estimateTokens(totalContent)
        }
      });
    }
  } catch (err) {
    console.error('Generate SiliconFlow report error:', err);
    let errorMessage = '⚠️ 硅基流动服务暂时不可用，请稍后重试或使用其他模型';
    
    // 检查具体错误类型
    if (err.message.includes('API key') || err.message.includes('authentication') || err.message.includes('401')) {
      errorMessage = '⚠️ 硅基流动API密钥配置错误，请检查配置';
    } else if (err.message.includes('network') || err.message.includes('ENOTFOUND') || err.message.includes('timeout')) {
      errorMessage = '⚠️ 网络连接失败，请检查网络连接后重试';
    } else if (err.message.includes('rate limit') || err.message.includes('quota') || err.message.includes('429')) {
      errorMessage = '⚠️ 硅基流动API调用频率超限，请稍后重试';
    } else if (err.message.includes('500') || err.message.includes('502') || err.message.includes('503')) {
      errorMessage = '⚠️ 硅基流动服务器错误，请稍后重试';
    }
    
    if (stream) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: '硅基流动服务错误', message: errorMessage, details: err.message });
    }
  }
});

// KIMI生成周报API
app.post('/api/generate-kimi-report', async (req, res) => {
  const { keyword, startDate, endDate, selectedNews, userPrompt, promptId, stream = false, summaryVersion } = req.body;
  
  if (!keyword || !startDate || !endDate || !selectedNews || selectedNews.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const fs = require('fs');
    const path = require('path');
    
    let systemPrompt = '';
    let userPromptTemplate = '';
    
    // 如果指定了promptId，使用关键词特定的prompt配置
    if (promptId) {
      try {
        const keywordPromptsPath = path.join(__dirname, 'config/keyword-prompts.json');
        const keywordPromptsContent = fs.readFileSync(keywordPromptsPath, 'utf-8');
        const keywordPrompts = JSON.parse(keywordPromptsContent);
        
        // 查找指定关键词的prompt配置
        const keywordConfig = keywordPrompts.keywords[keyword];
        if (keywordConfig && keywordConfig.prompts) {
          const selectedPrompt = keywordConfig.prompts.find(p => p.id === promptId);
          if (selectedPrompt) {
            systemPrompt = selectedPrompt.systemPrompt;
            userPromptTemplate = selectedPrompt.userPrompt;
            console.log(`KIMI使用关键词 ${keyword} 的自定义prompt配置 (ID: ${promptId})`);
          }
        }
      } catch (error) {
        console.warn('KIMI读取关键词prompt配置失败，使用默认配置:', error);
      }
    }
    
    // 如果没有找到关键词特定的prompt，使用默认配置
    if (!systemPrompt || !userPromptTemplate) {
      const promptsPath = path.join(__dirname, 'config/prompts.md');
      const promptsContent = fs.readFileSync(promptsPath, 'utf-8');
      
      // 解析system prompt和user prompt
      const systemPromptMatch = promptsContent.match(/## System Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
      const userPromptMatch = promptsContent.match(/## User Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
      
      systemPrompt = systemPromptMatch ? systemPromptMatch[1].trim() : '';
      userPromptTemplate = userPromptMatch ? userPromptMatch[1].trim() : '';
    }
    
    // 拼接新闻内容
    const newsContent = selectedNews.map((news, index) => {
      const text = summaryVersion === 'short' ? (news.short_summary || news.content || '内容不详') : (news.content || news.short_summary || '内容不详');
      return `新闻${index + 1}标题:${news.title}\n新闻${index + 1}内容:${text}`;
    }).join('\n\n');
    
    // 替换用户提示词中的变量
    const finalUserPrompt = userPromptTemplate
      .replace('{keyword}', keyword)
      .replace('{startDate}', startDate)
      .replace('{endDate}', endDate)
      .replace('{news}', newsContent)
      .replace('{usertopic}', userPrompt || '无特别要求');

    // Token估算函数
    const estimateTokens = (text) => {
      if (!text) return 0;
      const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
      const otherChars = text.length - chineseChars - englishChars;
      return Math.ceil(chineseChars * 0.6 + englishChars * 0.3 + otherChars * 0.5);
    };

    // 计算字数和Token估算
    const totalContent = systemPrompt + finalUserPrompt;
    const totalChars = totalContent.length;
    
    if (stream) {
      // 设置流式响应头
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // 发送初始调试信息
      const debugInfo = {
        systemPrompt,
        userPrompt: finalUserPrompt,
        newsCount: selectedNews.length,
        model: 'KIMI K2',
        totalChars,
        estimatedTokens: estimateTokens(totalContent)
      };
      
      res.write(`data: ${JSON.stringify({ type: 'debug', data: debugInfo })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'status', message: '🔗 正在连接KIMI K2...' })}\n\n`);
      
      // 调试：检查API密钥
      console.log('KIMI API Key:', process.env.KIMI_API_KEY ? `${process.env.KIMI_API_KEY.substring(0, 10)}...` : 'NOT FOUND');
      
      // 调用KIMI API with stream
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.KIMI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'kimi-k2-0905-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: finalUserPrompt }
          ],
          temperature: 0.5,
          max_tokens: 6000,
          stream: true
        })
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.error('KIMI API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: text
        });
        res.write(`data: ${JSON.stringify({ type: 'error', message: `KIMI API error: ${response.status} ${response.statusText} - ${text}` })}\n\n`);
        res.end();
        return;
      }
      
      res.write(`data: ${JSON.stringify({ type: 'status', message: '🤖 KIMI K2 开始生成...' })}\n\n`);
      
      let fullReport = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write(`data: ${JSON.stringify({ type: 'done', report: fullReport })}\n\n`);
              res.end();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                fullReport += content;
                res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
              } else if (parsed.error) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: parsed.error.message })}\n\n`);
                res.end();
                return;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } else {
      // 非流式模式
      console.log('KIMI API Key (non-stream):', process.env.KIMI_API_KEY ? `${process.env.KIMI_API_KEY.substring(0, 10)}...` : 'NOT FOUND');
      
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.KIMI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'kimi-k2-0905-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: finalUserPrompt }
          ],
          temperature: 0.5,
          max_tokens: 6000
        })
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.error('KIMI API Error Response (non-stream):', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: text
        });
        throw new Error(`KIMI API error: ${response.status} ${response.statusText} - ${text}`);
      }
      
      const data = await response.json();
      const report = data.choices?.[0]?.message?.content || '生成周报失败';
      res.json({ 
        report,
        debug: {
          systemPrompt,
          userPrompt: finalUserPrompt,
          newsCount: selectedNews.length,
          model: 'KIMI K2',
          totalChars,
          estimatedTokens: estimateTokens(totalContent)
        }
      });
    }
  } catch (err) {
    console.error('Generate KIMI report error:', err);
    let errorMessage = '⚠️ KIMI服务暂时不可用，请稍后重试或使用其他模型';
    
    // 检查具体错误类型
    if (err.message.includes('API key') || err.message.includes('authentication') || err.message.includes('401')) {
      errorMessage = '⚠️ KIMI API密钥配置错误，请检查配置';
    } else if (err.message.includes('network') || err.message.includes('ENOTFOUND') || err.message.includes('timeout')) {
      errorMessage = '⚠️ 网络连接失败，请检查网络连接后重试';
    } else if (err.message.includes('rate limit') || err.message.includes('quota') || err.message.includes('429')) {
      errorMessage = '⚠️ KIMI API调用频率超限，请稍后重试';
    } else if (err.message.includes('500') || err.message.includes('502') || err.message.includes('503')) {
      errorMessage = '⚠️ KIMI服务器错误，请稍后重试';
    }
    
    if (stream) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'KIMI服务错误', message: errorMessage, details: err.message });
    }
  }
});

// 获取配置信息API
app.get('/api/config/prompts', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // 读取提示词配置
    const promptsPath = path.join(__dirname, 'config/prompts.md');
    const promptsContent = fs.readFileSync(promptsPath, 'utf-8');
    
    // 解析各种提示词
    const systemPromptMatch = promptsContent.match(/## System Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
    const userPromptMatch = promptsContent.match(/## User Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
    const modifySystemPromptMatch = promptsContent.match(/## Modify System Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
    const modifyUserPromptMatch = promptsContent.match(/## Modify User Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/);
    
    res.json({
      systemPrompt: systemPromptMatch ? systemPromptMatch[1].trim() : '',
      userPrompt: userPromptMatch ? userPromptMatch[1].trim() : '',
      modifySystemPrompt: modifySystemPromptMatch ? modifySystemPromptMatch[1].trim() : '',
      modifyUserPrompt: modifyUserPromptMatch ? modifyUserPromptMatch[1].trim() : '',
      model: 'DeepSeek R1',
      modelConfig: {
        type: 'deepseek-reasoner',
        temperature: 0.7,
        outputLimit: 'unlimited',
        endpoint: 'api.deepseek.com'
      }
    });
  } catch (error) {
    console.error('获取配置失败:', error);
    res.status(500).json({ error: '获取配置失败' });
  }
});

// 获取关键词prompt配置API
app.get('/api/config/keyword-prompts', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const keywordPromptsPath = path.join(__dirname, 'config/keyword-prompts.json');
    
    // 检查文件是否存在
    if (!fs.existsSync(keywordPromptsPath)) {
      return res.json({
        keywords: {},
        metadata: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          description: '关键词级别的prompt配置文件'
        }
      });
    }
    
    const keywordPromptsContent = fs.readFileSync(keywordPromptsPath, 'utf-8');
    const keywordPrompts = JSON.parse(keywordPromptsContent);
    
    res.json(keywordPrompts);
  } catch (error) {
    console.error('获取关键词prompt配置失败:', error);
    res.status(500).json({ error: '获取关键词prompt配置失败' });
  }
});

// 获取指定关键词的prompt配置API
app.get('/api/config/keyword-prompts/:keyword', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { keyword } = req.params;
    
    const keywordPromptsPath = path.join(__dirname, 'config/keyword-prompts.json');
    
    if (!fs.existsSync(keywordPromptsPath)) {
      return res.status(404).json({ error: '关键词prompt配置文件不存在' });
    }
    
    const keywordPromptsContent = fs.readFileSync(keywordPromptsPath, 'utf-8');
    const keywordPrompts = JSON.parse(keywordPromptsContent);
    
    if (!keywordPrompts.keywords[keyword]) {
      return res.status(404).json({ error: `关键词 "${keyword}" 的配置不存在` });
    }
    
    res.json({
      keyword,
      prompts: keywordPrompts.keywords[keyword].prompts
    });
  } catch (error) {
    console.error('获取关键词prompt配置失败:', error);
    res.status(500).json({ error: '获取关键词prompt配置失败' });
  }
});

// 保存/更新关键词prompt配置API
app.post('/api/config/keyword-prompts', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { keyword, promptId, name, description, systemPrompt, userPrompt, isDefault } = req.body;

    if (!keyword || !name || !description || !systemPrompt || !userPrompt) {
      return res.status(400).json({ error: '缺少必要参数：关键词、版本名称、描述、System Prompt、User Prompt为必填' });
    }
    
    const keywordPromptsPath = path.join(__dirname, 'config/keyword-prompts.json');
    let keywordPrompts;
    
    // 读取现有配置或创建新配置
    if (fs.existsSync(keywordPromptsPath)) {
      const keywordPromptsContent = fs.readFileSync(keywordPromptsPath, 'utf-8');
      keywordPrompts = JSON.parse(keywordPromptsContent);
    } else {
      keywordPrompts = {
        keywords: {},
        metadata: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          description: '关键词级别的prompt配置文件'
        }
      };
    }
    
    // 初始化关键词配置
    if (!keywordPrompts.keywords[keyword]) {
      keywordPrompts.keywords[keyword] = {
        prompts: []
      };
    }
    
    // 生成或使用版本ID（选填）
    const rawId = (promptId || '').trim();
    const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '');
    const ts = new Date();
    const tsStr = `${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}`;
    let effectiveId = rawId || `${slugify(name)}-${tsStr}`;
    // 保证ID在该关键词下唯一
    const existingIds = new Set(keywordPrompts.keywords[keyword].prompts.map(p => p.id));
    if (existingIds.has(effectiveId)) {
      let counter = 2;
      while (existingIds.has(`${effectiveId}-${counter}`)) counter++;
      effectiveId = `${effectiveId}-${counter}`;
    }

    // 查找现有prompt配置
    const existingPromptIndex = keywordPrompts.keywords[keyword].prompts.findIndex(p => p.id === effectiveId || p.id === rawId);

    const promptConfig = {
      id: existingPromptIndex >= 0 ? keywordPrompts.keywords[keyword].prompts[existingPromptIndex].id : effectiveId,
      name,
      description: description || '',
      systemPrompt,
      userPrompt,
      isDefault: isDefault || false,
      createdAt: existingPromptIndex >= 0 ? keywordPrompts.keywords[keyword].prompts[existingPromptIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // 如果设置为默认配置，取消其他配置的默认状态
    if (isDefault) {
      keywordPrompts.keywords[keyword].prompts.forEach(p => {
        p.isDefault = false;
      });
    }
    
    // 更新或添加配置
    if (existingPromptIndex >= 0) {
      keywordPrompts.keywords[keyword].prompts[existingPromptIndex] = promptConfig;
    } else {
      keywordPrompts.keywords[keyword].prompts.push(promptConfig);
    }
    
    // 更新元数据
    keywordPrompts.metadata.lastUpdated = new Date().toISOString();
    
    // 保存配置文件
    fs.writeFileSync(keywordPromptsPath, JSON.stringify(keywordPrompts, null, 2), 'utf-8');
    
    res.json({ 
      success: true, 
      message: '配置保存成功',
      prompt: promptConfig
    });
  } catch (error) {
    console.error('保存关键词prompt配置失败:', error);
    res.status(500).json({ error: '保存关键词prompt配置失败' });
  }
});

// 删除关键词prompt配置API
app.delete('/api/config/keyword-prompts/:keyword/:promptId', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { keyword, promptId } = req.params;
    
    const keywordPromptsPath = path.join(__dirname, 'config/keyword-prompts.json');
    
    if (!fs.existsSync(keywordPromptsPath)) {
      return res.status(404).json({ error: '关键词prompt配置文件不存在' });
    }
    
    const keywordPromptsContent = fs.readFileSync(keywordPromptsPath, 'utf-8');
    const keywordPrompts = JSON.parse(keywordPromptsContent);
    
    if (!keywordPrompts.keywords[keyword]) {
      return res.status(404).json({ error: `关键词 "${keyword}" 的配置不存在` });
    }
    
    const promptIndex = keywordPrompts.keywords[keyword].prompts.findIndex(p => p.id === promptId);
    
    if (promptIndex === -1) {
      return res.status(404).json({ error: `Prompt配置 "${promptId}" 不存在` });
    }
    
    // 删除配置
    keywordPrompts.keywords[keyword].prompts.splice(promptIndex, 1);
    
    // 如果删除后没有配置了，删除整个关键词
    if (keywordPrompts.keywords[keyword].prompts.length === 0) {
      delete keywordPrompts.keywords[keyword];
    }
    
    // 更新元数据
    keywordPrompts.metadata.lastUpdated = new Date().toISOString();
    
    // 保存配置文件
    fs.writeFileSync(keywordPromptsPath, JSON.stringify(keywordPrompts, null, 2), 'utf-8');
    
    res.json({ 
      success: true, 
      message: '配置删除成功'
    });
  } catch (error) {
    console.error('删除关键词prompt配置失败:', error);
    res.status(500).json({ error: '删除关键词prompt配置失败' });
  }
});

// LLM管理接口

// 获取所有可用模型
app.get('/api/llm/models', async (req, res) => {
  try {
    const LLMService = require('./services/llmService');
    const llmService = new LLMService();
    
    const models = llmService.getAvailableModels();
    res.json(models);
  } catch (err) {
    console.error('Get models error:', err);
    res.status(500).json({ error: 'Failed to get models', details: err.message });
  }
});

// 获取当前活跃模型
app.get('/api/llm/active-model', async (req, res) => {
  try {
    const LLMService = require('./services/llmService');
    const llmService = new LLMService();
    
    const activeModel = llmService.getActiveModelConfig();
    res.json(activeModel);
  } catch (err) {
    console.error('Get active model error:', err);
    res.status(500).json({ error: 'Failed to get active model', details: err.message });
  }
});

// 切换模型
app.post('/api/llm/switch-model', async (req, res) => {
  const { modelKey } = req.body;
  
  if (!modelKey) {
    return res.status(400).json({ error: 'modelKey is required' });
  }
  
  try {
    const LLMService = require('./services/llmService');
    const llmService = new LLMService();
    
    const newActiveModel = llmService.switchModel(modelKey);
    res.json({ 
      message: `Successfully switched to model: ${modelKey}`,
      activeModel: newActiveModel 
    });
  } catch (err) {
    console.error('Switch model error:', err);
    res.status(500).json({ error: 'Failed to switch model', details: err.message });
  }
});

// 获取自定义Prompt选项
app.get('/api/llm/custom-prompts', async (req, res) => {
  try {
    const LLMService = require('./services/llmService');
    const llmService = new LLMService();
    
    const customPrompts = llmService.getCustomPrompts();
    res.json(customPrompts);
  } catch (err) {
    console.error('Get custom prompts error:', err);
    res.status(500).json({ error: 'Failed to get custom prompts', details: err.message });
  }
});

// 重新加载配置
app.post('/api/llm/reload-config', async (req, res) => {
  try {
    const LLMService = require('./services/llmService');
    const llmService = new LLMService();
    
    const config = llmService.reloadConfig();
    res.json({ 
      message: 'Configuration reloaded successfully',
      activeModel: config.activeModel
    });
  } catch (err) {
    console.error('Reload config error:', err);
    res.status(500).json({ error: 'Failed to reload configuration', details: err.message });
  }
});

// 质量分析API - 获取各轮次总结数据
app.get('/api/quality-analysis', async (req, res) => {
  const { keyword, date } = req.query;
  
  if (!keyword || !date) {
    return res.status(400).json({ error: 'Missing required parameters: keyword and date' });
  }
  
  try {
    console.log('=== 质量分析API调试信息 ===');
    console.log('请求参数:', { keyword, date });
    
    // 获取指定日期的各轮次总结数据
    const [summaryRows] = await pool.query(
      'SELECT round, summary FROM summary_news WHERE keyword = ? AND date = ? ORDER BY round',
      [keyword, date]
    );
    
    console.log('查询到的总结数据:', summaryRows);
    
    // 获取前一天的总结数据作为对比
    const previousDate = new Date(date);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateStr = previousDate.toISOString().split('T')[0];
    
    const [yesterdayRows] = await pool.query(
      'SELECT summary FROM summary_news WHERE keyword = ? AND date = ? ORDER BY round DESC LIMIT 1',
      [keyword, previousDateStr]
    );
    
    console.log('前一天总结数据:', yesterdayRows);
    
    // 构建返回数据
    const result = {
      round1Summary: '',
      round2Summary: '',
      round3Summary: '',
      modifyAdvice: '',
      yesterdaySummary: yesterdayRows.length > 0 ? yesterdayRows[0].summary : null
    };
    
    // 将各轮次数据分配到对应字段
    summaryRows.forEach(row => {
      switch(row.round) {
        case 1:
          result.round1Summary = row.summary;
          break;
        case 2:
          result.round2Summary = row.summary;
          break;
        case 3:
          result.round3Summary = row.summary;
          break;
      }
    });
    
    // 模拟修改建议（实际项目中可能需要从其他表获取）
    if (result.round1Summary && result.round2Summary) {
      result.modifyAdvice = `基于第一轮总结的内容，LLM建议：
      
## 内容结构优化
- 增强时间线逻辑，按照事件发生的先后顺序重新组织内容
- 突出关键政策变化和重要决策的影响分析
- 加强数据支撑，补充更多具体的数字和统计信息

## 表达方式改进
- 使用更加正式的商业分析语言
- 增强逻辑连贯性，改善段落之间的过渡
- 强化结论部分，提出更具体的行动建议

## 重点内容调整
- 加强对风险因素的分析和预警
- 补充行业对比和竞争态势分析
- 增加对未来发展趋势的预测判断`;
    } else if (result.round1Summary && !result.round2Summary) {
      result.modifyAdvice = `基于第一轮总结的内容，LLM建议：
      
## 内容完善建议
- 当前仅有第一轮总结，建议进行二轮优化
- 可以加强内容的逻辑性和专业性
- 增加更多数据支撑和分析深度`;
    }
    
    console.log('返回结果:', result);
    res.json(result);
  } catch (error) {
    console.error('获取质量分析数据失败:', error);
    res.status(500).json({ error: 'Failed to fetch quality analysis data', details: error.message });
  }
});

// Google搜索API
app.post('/api/google-search', async (req, res) => {
  const { query, startDate, endDate, maxResults = 20 } = req.body;
  
  console.log('=== Google搜索API调试信息 ===');
  console.log('请求参数:', { query, startDate, endDate, maxResults });
  
  if (!query) {
    console.log('错误: 缺少查询参数');
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    // 检查环境变量
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    console.log('环境变量检查:');
    console.log('- GOOGLE_API_KEY存在:', !!apiKey);
    console.log('- GOOGLE_API_KEY长度:', apiKey ? apiKey.length : 0);
    console.log('- GOOGLE_API_KEY前10位:', apiKey ? apiKey.substring(0, 10) + '...' : 'undefined');
    console.log('- GOOGLE_SEARCH_ENGINE_ID存在:', !!searchEngineId);
    console.log('- GOOGLE_SEARCH_ENGINE_ID:', searchEngineId ? searchEngineId : 'undefined');
    
    if (!apiKey || !searchEngineId) {
      const errorMsg = `配置缺失: ${!apiKey ? 'GOOGLE_API_KEY' : ''} ${!searchEngineId ? 'GOOGLE_SEARCH_ENGINE_ID' : ''}`;
      console.log('配置错误:', errorMsg);
      throw new Error(errorMsg);
    }

    // 构建搜索URL
    const baseUrl = 'https://www.googleapis.com/customsearch/v1';
    const params = new URLSearchParams({
      key: apiKey,
      cx: searchEngineId,
      q: query,
      num: Math.min(maxResults, 10), // Google自定义搜索API单次最多返回10个结果
      lr: 'lang_zh', // 限制中文结果
      cr: 'countryCN', // 限制中国地区
      sort: 'date', // 按日期排序，最新的在前
    });

    // 使用更精确的日期过滤
    if (startDate && endDate) {
      // 使用 dateRestrict 参数，格式：d[number] 表示最近几天
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      
      // 如果是最近7天以内，使用 d7 格式（更准确）
      if (daysDiff <= 7) {
        params.append('dateRestrict', `d${daysDiff}`);
        console.log(`日期过滤: 最近${daysDiff}天`);
      } else {
        // 超过7天的使用具体日期范围
        const formattedStartDate = start.toISOString().split('T')[0].replace(/-/g, '');
        const formattedEndDate = end.toISOString().split('T')[0].replace(/-/g, '');
        const dateRestrict = `d:${formattedStartDate}..${formattedEndDate}`;
        params.append('dateRestrict', dateRestrict);
        console.log('日期过滤:', dateRestrict);
      }
    } else {
      // 如果没有指定日期，默认搜索最近7天
      params.append('dateRestrict', 'd7');
      console.log('默认日期过滤: 最近7天');
    }

    const searchUrl = `${baseUrl}?${params.toString()}`;
    console.log('完整搜索URL:', searchUrl);
    
    // 隐藏API密钥的URL（用于安全日志）
    const safeUrl = searchUrl.replace(apiKey, 'API_KEY_HIDDEN');
    console.log('安全URL（隐藏密钥）:', safeUrl);

    console.log('发起Google API请求...');
    const response = await fetch(searchUrl);
    
    console.log('Google API响应状态:', response.status, response.statusText);
    console.log('响应头:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google搜索API详细错误:');
      console.error('- 状态码:', response.status);
      console.error('- 状态文本:', response.statusText);
      console.error('- 错误内容:', errorText);
      
      // 尝试解析错误JSON
      try {
        const errorJson = JSON.parse(errorText);
        console.error('- 解析后的错误:', JSON.stringify(errorJson, null, 2));
        
        // 提供更具体的错误信息
        if (errorJson.error) {
          const { code, message, status } = errorJson.error;
          throw new Error(`Google API错误 ${code} (${status}): ${message}`);
        }
      } catch (parseError) {
        console.error('- 无法解析错误JSON:', parseError.message);
      }
      
      throw new Error(`Google搜索API错误: ${response.status} ${response.statusText} - ${errorText}`);
    }

    console.log('开始解析响应数据...');
    const data = await response.json();
    console.log('响应数据结构:', {
      hasItems: !!data.items,
      itemsCount: data.items ? data.items.length : 0,
      hasSearchInformation: !!data.searchInformation,
      totalResults: data.searchInformation?.totalResults,
      searchTime: data.searchInformation?.searchTime
    });
    
    // 如果没有搜索结果，记录详细信息
    if (!data.items || data.items.length === 0) {
      console.log('警告: 没有搜索结果');
      console.log('完整响应数据:', JSON.stringify(data, null, 2));
    }
    
    // 解析搜索结果
    const results = (data.items || []).map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayLink: item.displayLink,
      formattedUrl: item.formattedUrl
    }));

    console.log(`Google搜索成功完成，返回 ${results.length} 个结果`);
    
    if (results.length > 0) {
      console.log('第一个结果示例:', {
        title: results[0].title?.substring(0, 50) + '...',
        link: results[0].link,
        displayLink: results[0].displayLink
      });
    }

    res.json({
      results,
      searchInfo: {
        totalResults: data.searchInformation?.totalResults || '0',
        searchTime: data.searchInformation?.searchTime || 0,
        query: data.queries?.request?.[0]?.searchTerms || query
      },
      debug: {
        requestUrl: safeUrl,
        responseStatus: response.status,
        itemsFound: results.length,
        totalAvailable: data.searchInformation?.totalResults || '0'
      }
    });

  } catch (error) {
    console.error('=== Google搜索失败 ===');
    console.error('错误类型:', error.name);
    console.error('错误消息:', error.message);
    console.error('错误堆栈:', error.stack);
    
    // 返回详细的错误信息
    res.status(500).json({ 
      error: 'Google搜索失败', 
      details: error.message,
      debugInfo: {
        hasApiKey: !!process.env.GOOGLE_API_KEY,
        hasSearchEngineId: !!process.env.GOOGLE_SEARCH_ENGINE_ID,
        query,
        timestamp: new Date().toISOString()
      }
    });
  }
});



// 字数统计API
app.get('/api/word-count-stats', async (req, res) => {
  try {
    const keywords = ['养老', '公积金', '政府基金', '江苏省国资委', '数字政务', '高考', '中国烟草'];
    const { days = 90 } = req.query; // 默认显示最近90天
    
    // 计算日期范围
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days));
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`字数统计查询范围: ${startDateStr} 到 ${endDateStr}`);
    
    // 按日期和关键词统计
    const [statsRows] = await pool.query(`
      SELECT 
        DATE(fetchdate) as fetchdate,
        keyword,
        COUNT(*) as newsCount,
        SUM(CHAR_LENGTH(COALESCE(title, '')) + CHAR_LENGTH(COALESCE(content, ''))) as totalWords,
        SUM(CASE WHEN CAST(score AS DECIMAL(3,1)) >= 3.0 THEN 1 ELSE 0 END) as highScoreCount,
        SUM(CASE WHEN CAST(score AS DECIMAL(3,1)) >= 3.0 THEN CHAR_LENGTH(COALESCE(title, '')) + CHAR_LENGTH(COALESCE(content, '')) ELSE 0 END) as highScoreWords,
        SUM(CASE WHEN CAST(score AS DECIMAL(3,1)) >= 4.0 THEN 1 ELSE 0 END) as veryHighScoreCount,
        SUM(CASE WHEN CAST(score AS DECIMAL(3,1)) >= 4.0 THEN CHAR_LENGTH(COALESCE(title, '')) + CHAR_LENGTH(COALESCE(content, '')) ELSE 0 END) as veryHighScoreWords,
        SUM(
          CASE 
            WHEN TRIM(COALESCE(sourceapi, '')) = '定制爬取'
            THEN 1 
            ELSE 0 
          END
        ) as customGrabCount,
        SUM(
          CASE 
            WHEN TRIM(COALESCE(sourceapi, '')) = '极致了api'
            THEN 1 
            ELSE 0 
          END
        ) as wechatCount
      FROM scored_news 
      WHERE keyword IN (?) 
        AND fetchdate >= ? 
        AND fetchdate <= ?
        AND fetchdate IS NOT NULL
      GROUP BY DATE(fetchdate), keyword
      ORDER BY DATE(fetchdate) DESC, keyword
    `, [keywords, startDateStr, endDateStr]);
    
    // 针对“江苏省国资委”，按 search_keyword 统计定制爬取与微信公众号明细
    const [customDetailRows] = await pool.query(`
      SELECT 
        DATE(fetchdate) as fetchdate,
        COALESCE(search_keyword, '') as search_keyword,
        COUNT(*) as count
      FROM scored_news
      WHERE keyword = '江苏省国资委'
        AND fetchdate >= ?
        AND fetchdate <= ?
        AND fetchdate IS NOT NULL
        AND TRIM(COALESCE(sourceapi, '')) = '定制爬取'
      GROUP BY DATE(fetchdate), COALESCE(search_keyword, '')
      ORDER BY DATE(fetchdate) DESC
    `, [startDateStr, endDateStr]);

    const [wechatDetailRows] = await pool.query(`
      SELECT 
        DATE(fetchdate) as fetchdate,
        COALESCE(search_keyword, '') as search_keyword,
        COUNT(*) as count
      FROM scored_news
      WHERE keyword = '江苏省国资委'
        AND fetchdate >= ?
        AND fetchdate <= ?
        AND fetchdate IS NOT NULL
        AND TRIM(COALESCE(sourceapi, '')) = '极致了api'
      GROUP BY DATE(fetchdate), COALESCE(search_keyword, '')
      ORDER BY DATE(fetchdate) DESC
    `, [startDateStr, endDateStr]);

    // 合并到返回结果中（仅江苏省国资委）
    const detailsMap = {};
    customDetailRows.forEach(r => {
      const date = r.fetchdate;
      const sk = r.search_keyword || '未知';
      if (!detailsMap[date]) detailsMap[date] = {};
      detailsMap[date][sk] = (detailsMap[date][sk] || 0) + (r.count || 0);
    });

    const wechatDetailsMap = {};
    wechatDetailRows.forEach(r => {
      const date = r.fetchdate;
      const sk = r.search_keyword || '未知';
      if (!wechatDetailsMap[date]) wechatDetailsMap[date] = {};
      wechatDetailsMap[date][sk] = (wechatDetailsMap[date][sk] || 0) + (r.count || 0);
    });

    statsRows.forEach(row => {
      if (row.keyword === '江苏省国资委') {
        row.customGrabDetails = detailsMap[row.fetchdate] || {};
        row.wechatDetails = wechatDetailsMap[row.fetchdate] || {};
      }
    });

    console.log(`字数统计返回 ${statsRows.length} 条记录（含定制爬取与微信公众号明细）`);
    res.json(statsRows);
  } catch (error) {
    console.error('字数统计API错误:', error);
    res.status(500).json({ error: '获取字数统计失败', details: error.message });
  }
});

// 静态托管 dist 目录
app.use(express.static(path.join(__dirname, 'dist')));

// SPA 路由支持（非 API 路径都返回前端首页）
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API not found' });
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const port = process.env.API_PORT || 3000;
app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
});
