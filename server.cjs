require('dotenv').config();
const express = require('express');
const fs = require('fs');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const {
  buildReportPdfFilename,
  PdfRendererUnavailableError,
  renderReportPdf,
} = require('./server/pdf/renderReportPdf.cjs');
const {
  buildPolicyComparisonPdfFilename,
  renderPolicyComparisonPdf,
} = require('./server/pdf/renderPolicyComparisonPdf.cjs');
const {
  buildRegionPolicyReportPdfFilename,
  renderRegionPolicyReportPdf,
} = require('./server/pdf/renderRegionPolicyReportPdf.cjs');

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

function buildAttachmentDisposition(filename) {
  const safeAscii = filename.replace(/[^\x20-\x7E]+/g, '_');
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const REGION_POLICY_REPORT_PROMPTS_PATH = path.join(__dirname, 'config/region-policy-report-prompts.json');
const REGION_POLICY_REPORT_KEYWORD = '公积金';
const REGION_POLICY_REPORT_MODEL = 'deepseek-reasoner';

function loadJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function slugifyPromptId(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createEmptyRegionPolicyPromptConfig() {
  return {
    metadata: {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      description: '地区政策报告 Prompt 配置，支持多版本与单地区/多地区双模板',
    },
    prompts: [],
  };
}

function loadRegionPolicyPromptConfig() {
  return loadJsonFile(REGION_POLICY_REPORT_PROMPTS_PATH, createEmptyRegionPolicyPromptConfig());
}

function saveRegionPolicyPromptConfig(config) {
  const nextConfig = config || createEmptyRegionPolicyPromptConfig();
  nextConfig.metadata = nextConfig.metadata || {};
  nextConfig.metadata.version = nextConfig.metadata.version || '1.0.0';
  nextConfig.metadata.description = nextConfig.metadata.description || '地区政策报告 Prompt 配置，支持多版本与单地区/多地区双模板';
  nextConfig.metadata.lastUpdated = new Date().toISOString();
  nextConfig.prompts = Array.isArray(nextConfig.prompts) ? nextConfig.prompts : [];
  writeJsonFile(REGION_POLICY_REPORT_PROMPTS_PATH, nextConfig);
  return nextConfig;
}

function getRegionPromptSummary(prompt) {
  return {
    id: prompt.id,
    name: prompt.name,
    description: prompt.description || '',
    systemPrompt: prompt.systemPrompt || '',
    userPromptSingle: prompt.userPromptSingle || '',
    userPromptMulti: prompt.userPromptMulti || '',
    isDefault: !!prompt.isDefault,
    updatedAt: prompt.updatedAt,
  };
}

function getNextDateYmd(value = '') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

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
    where += ' AND fetchdate >= ? AND fetchdate < ?';
    params.push(date, getNextDateYmd(date));
  } else {
    if (startDate) {
      where += ' AND fetchdate >= ?';
      params.push(startDate);
    }
    if (endDate) {
      where += ' AND fetchdate < ?';
      params.push(getNextDateYmd(endDate));
    }
  }
  
  console.log('生成的WHERE条件:', where);
  console.log('参数数组:', params);
  
  // 先测试基础查询 - 不带分数筛选
  if (date === '2024-10-12') {
    console.log('=== 基础数据检查 ===');
    try {
      const [basicRows] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE fetchdate >= ? AND fetchdate < ?', [date, getNextDateYmd(date)]);
      console.log('该日期总数据量:', basicRows[0].count);
      
      // 检查score字段的实际值
      const [scoreCheck] = await pool.query('SELECT score, COUNT(*) as count FROM scored_news WHERE fetchdate >= ? AND fetchdate < ? GROUP BY score', [date, getNextDateYmd(date)]);
      console.log('score字段分布:', scoreCheck);
      
      // 检查具体的未评分数据
      const [unscoredCheck] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE fetchdate >= ? AND fetchdate < ? AND (score IS NULL OR score = "")', [date, getNextDateYmd(date)]);
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
    const [testDate] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE fetchdate >= ? AND fetchdate < ?', [date, getNextDateYmd(date)]);
    console.log('仅日期条件结果:', testDate[0].count);
    
    const [testScore] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE (score IS NULL OR score = "")', []);
    console.log('仅分数条件结果:', testScore[0].count);
    
    const [testBoth] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE fetchdate >= ? AND fetchdate < ? AND (score IS NULL OR score = "")', [date, getNextDateYmd(date)]);
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
      WHERE keyword = ? AND fetchdate >= ? AND fetchdate < ?
      ORDER BY id ASC
    `;
    
    console.log('执行SQL:', sql);
    console.log('参数:', [keyword, date, getNextDateYmd(date)]);
    
    const [rows] = await pool.query(sql, [keyword, date, getNextDateYmd(date)]);
    console.log('查询结果数量:', rows.length);
    
    if (rows.length > 0) {
      console.log('第一条数据示例:', rows[0]);
    } else {
      // 如果没有数据，检查是否有相似的数据
      const [testRows] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE keyword = ?', [keyword]);
      console.log('该关键词总数据量:', testRows[0].count);
      
      const [dateRows] = await pool.query('SELECT COUNT(*) as count FROM scored_news WHERE fetchdate >= ? AND fetchdate < ?', [date, getNextDateYmd(date)]);
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

    // 拼接潜在客户专用新闻内容 {qianzai_news}
    const qianzaiNewsContent = selectedNews.map((news, index) => {
      const text = summaryVersion === 'short' ? (news.short_summary || news.content || '内容不详') : (news.content || news.short_summary || '内容不详');
      return `这是我的潜在客户<${news.search_keyword || '未知客户'}>，以下是我搜索到的新闻<${text}>`;
    }).join('\n\n');
    
    // 替换用户提示词中的变量
    const finalUserPrompt = userPromptTemplate
      .replace('{keyword}', keyword)
      .replace('{startDate}', startDate)
      .replace('{endDate}', endDate)
      .replace('{news}', newsContent)
      .replace('{qianzai_news}', qianzaiNewsContent)
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

    // 拼接潜在客户专用新闻内容 {qianzai_news}
    const qianzaiNewsContent = selectedNews.map((news, index) => {
      const text = summaryVersion === 'short' ? (news.short_summary || news.content || '内容不详') : (news.content || news.short_summary || '内容不详');
      return `这是我的潜在客户<${news.search_keyword || '未知客户'}>，以下是我搜索到的新闻<${text}>`;
    }).join('\n\n');
    
    // 替换用户提示词中的变量
    const finalUserPrompt = userPromptTemplate
      .replace('{keyword}', keyword)
      .replace('{startDate}', startDate)
      .replace('{endDate}', endDate)
      .replace('{news}', newsContent)
      .replace('{qianzai_news}', qianzaiNewsContent)
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
              // 保存报告到数据库
              try {
                await pool.query(
                  `INSERT INTO weekly_reports (keyword, start_date, end_date, report_content, model_used, news_count)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [keyword, startDate, endDate, fullReport, 'deepseek-reasoner', selectedNews.length]
                );
                console.log('✅ 周报已保存到数据库, keyword:', keyword, 'dates:', startDate, '-', endDate);
              } catch (saveError) {
                console.error('❌ 保存周报到数据库失败:', saveError);
              }

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

      // 保存报告到数据库
      try {
        await pool.query(
          `INSERT INTO weekly_reports (keyword, start_date, end_date, report_content, model_used, news_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [keyword, startDate, endDate, report, 'deepseek-reasoner', selectedNews.length]
        );
        console.log('✅ 周报已保存到数据库 (非流式), keyword:', keyword, 'dates:', startDate, '-', endDate);
      } catch (saveError) {
        console.error('❌ 保存周报到数据库失败 (非流式):', saveError);
      }

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
                // 保存报告到数据库
                try {
                  await pool.query(
                    `INSERT INTO weekly_reports (keyword, start_date, end_date, report_content, model_used, news_count)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [keyword, startDate, endDate, fullReport, 'deepseek-ai/DeepSeek-R1', selectedNews.length]
                  );
                  console.log('✅ SiliconFlow周报已保存到数据库, keyword:', keyword, 'dates:', startDate, '-', endDate);
                } catch (saveError) {
                  console.error('❌ 保存SiliconFlow周报到数据库失败:', saveError);
                }

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

      // 保存报告到数据库
      try {
        await pool.query(
          `INSERT INTO weekly_reports (keyword, start_date, end_date, report_content, model_used, news_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [keyword, startDate, endDate, report, 'deepseek-ai/DeepSeek-R1', selectedNews.length]
        );
        console.log('✅ SiliconFlow周报已保存到数据库 (非流式), keyword:', keyword, 'dates:', startDate, '-', endDate);
      } catch (saveError) {
        console.error('❌ 保存SiliconFlow周报到数据库失败 (非流式):', saveError);
      }

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
              // 保存报告到数据库
              try {
                await pool.query(
                  `INSERT INTO weekly_reports (keyword, start_date, end_date, report_content, model_used, news_count)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [keyword, startDate, endDate, fullReport, 'kimi-k2-0905-preview', selectedNews.length]
                );
                console.log('✅ KIMI周报已保存到数据库, keyword:', keyword, 'dates:', startDate, '-', endDate);
              } catch (saveError) {
                console.error('❌ 保存KIMI周报到数据库失败:', saveError);
              }

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

      // 保存报告到数据库
      try {
        await pool.query(
          `INSERT INTO weekly_reports (keyword, start_date, end_date, report_content, model_used, news_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [keyword, startDate, endDate, report, 'kimi-k2-0905-preview', selectedNews.length]
        );
        console.log('✅ KIMI周报已保存到数据库 (非流式), keyword:', keyword, 'dates:', startDate, '-', endDate);
      } catch (saveError) {
        console.error('❌ 保存KIMI周报到数据库失败 (非流式):', saveError);
      }

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
    
    // 读取周报生成提示词配置
    const promptsPath = path.join(__dirname, 'config/prompts.md');
    const promptsContent = fs.readFileSync(promptsPath, 'utf-8');
    
    // 读取政策分析提示词配置
    const policyPromptsPath = path.join(__dirname, 'config/policy_prompts.md');
    let policyPromptsContent = '';
    if (fs.existsSync(policyPromptsPath)) {
        policyPromptsContent = fs.readFileSync(policyPromptsPath, 'utf-8');
    }
    
    // 解析周报生成提示词
    const systemPromptMatch = promptsContent.match(/## System Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/);
    const userPromptMatch = promptsContent.match(/## User Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/);
    const modifySystemPromptMatch = promptsContent.match(/## Modify System Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/);
    const modifyUserPromptMatch = promptsContent.match(/## Modify User Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/);
    
    // 解析政策分析提示词
    const policyComparisonPromptMatch = policyPromptsContent.match(/## Policy Comparison Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/);
    const policyExtractionPromptMatch = policyPromptsContent.match(/## Policy Extraction Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/);
    
    // 默认优化后的提示词 (从文件读取失败时的后备)
    const defaultExtractionPrompt = '';

    res.json({
      systemPrompt: systemPromptMatch ? systemPromptMatch[1].trim() : '',
      userPrompt: userPromptMatch ? userPromptMatch[1].trim() : '',
      modifySystemPrompt: modifySystemPromptMatch ? modifySystemPromptMatch[1].trim() : '',
      modifyUserPrompt: modifyUserPromptMatch ? modifyUserPromptMatch[1].trim() : '',
      policyComparisonPrompt: policyComparisonPromptMatch ? policyComparisonPromptMatch[1].trim() : '',
      policyExtractionPrompt: policyExtractionPromptMatch ? policyExtractionPromptMatch[1].trim() : defaultExtractionPrompt,
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

// 保存政策相关Prompt
app.post('/api/config/policy-prompt', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { prompt, type } = req.body; // type: 'comparison' or 'extraction'
    
    // 使用新的配置文件
    const promptsPath = path.join(__dirname, 'config/policy_prompts.md');
    let content = '';
    
    if (fs.existsSync(promptsPath)) {
        content = fs.readFileSync(promptsPath, 'utf-8');
    }
    
    const sectionTitle = type === 'extraction' ? 'Policy Extraction Prompt' : 'Policy Comparison Prompt';
    
    // 检查是否存在对应部分 (使用更宽松的正则)
    const regex = new RegExp(`## ${sectionTitle}[\\s\\S]*?\`\`\`\\w*\\s*[\\s\\S]*?\`\`\``);
    
    if (regex.test(content)) {
      content = content.replace(
        regex,
        `## ${sectionTitle}\n\n\`\`\`\n${prompt}\n\`\`\``
      );
    } else {
      content += `\n\n## ${sectionTitle}\n\n\`\`\`\n${prompt}\n\`\`\``;
    }
    
    fs.writeFileSync(promptsPath, content, 'utf-8');
    res.json({ success: true });
  } catch (error) {
    console.error(`保存${req.body.type}Prompt失败:`, error);
    res.status(500).json({ error: '保存失败' });
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

// 获取地区政策报告 prompt 配置
app.get('/api/config/region-policy-report-prompts', async (req, res) => {
  try {
    const config = loadRegionPolicyPromptConfig();
    res.json(config);
  } catch (error) {
    console.error('获取地区政策报告 prompt 配置失败:', error);
    res.status(500).json({ error: '获取地区政策报告 prompt 配置失败' });
  }
});

// 获取单个地区政策报告 prompt
app.get('/api/config/region-policy-report-prompts/:promptId', async (req, res) => {
  try {
    const config = loadRegionPolicyPromptConfig();
    const prompt = (config.prompts || []).find((item) => item.id === req.params.promptId);
    if (!prompt) {
      return res.status(404).json({ error: `Prompt配置 "${req.params.promptId}" 不存在` });
    }
    res.json(prompt);
  } catch (error) {
    console.error('获取地区政策报告 prompt 失败:', error);
    res.status(500).json({ error: '获取地区政策报告 prompt 失败' });
  }
});

// 保存/更新地区政策报告 prompt
app.post('/api/config/region-policy-report-prompts', async (req, res) => {
  try {
    const {
      promptId,
      name,
      description,
      systemPrompt,
      userPromptSingle,
      userPromptMulti,
      isDefault,
    } = req.body || {};

    if (!name || !description || !systemPrompt || !userPromptSingle || !userPromptMulti) {
      return res.status(400).json({
        error: '缺少必要参数：版本名称、描述、System Prompt、单地区 User Prompt、多地区 User Prompt 为必填',
      });
    }

    const config = loadRegionPolicyPromptConfig();
    const now = new Date().toISOString();
    const rawId = String(promptId || '').trim();
    let effectiveId = rawId || `${slugifyPromptId(name)}-${now.slice(0, 16).replace(/[-:T]/g, '')}`;
    const existingIndex = (config.prompts || []).findIndex((item) => item.id === rawId || item.id === effectiveId);

    if (existingIndex === -1) {
      const existingIds = new Set((config.prompts || []).map((item) => item.id));
      if (existingIds.has(effectiveId)) {
        let counter = 2;
        while (existingIds.has(`${effectiveId}-${counter}`)) counter += 1;
        effectiveId = `${effectiveId}-${counter}`;
      }
    } else {
      effectiveId = config.prompts[existingIndex].id;
    }

    if (isDefault) {
      (config.prompts || []).forEach((item) => {
        item.isDefault = false;
      });
    }

    const prompt = {
      id: effectiveId,
      name: String(name).trim(),
      description: String(description || '').trim(),
      systemPrompt: String(systemPrompt || ''),
      userPromptSingle: String(userPromptSingle || ''),
      userPromptMulti: String(userPromptMulti || ''),
      isDefault: !!isDefault,
      createdAt: existingIndex >= 0 ? config.prompts[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      config.prompts[existingIndex] = prompt;
    } else {
      config.prompts.push(prompt);
    }

    saveRegionPolicyPromptConfig(config);
    res.json({
      success: true,
      message: '配置保存成功',
      prompt,
    });
  } catch (error) {
    console.error('保存地区政策报告 prompt 失败:', error);
    res.status(500).json({ error: '保存地区政策报告 prompt 失败' });
  }
});

// 删除地区政策报告 prompt
app.delete('/api/config/region-policy-report-prompts/:promptId', async (req, res) => {
  try {
    const config = loadRegionPolicyPromptConfig();
    if ((config.prompts || []).length <= 1) {
      return res.status(400).json({ error: '至少保留一个地区政策报告 Prompt 版本，不能删除最后一个版本' });
    }
    const promptIndex = (config.prompts || []).findIndex((item) => item.id === req.params.promptId);
    if (promptIndex === -1) {
      return res.status(404).json({ error: `Prompt配置 "${req.params.promptId}" 不存在` });
    }

    config.prompts.splice(promptIndex, 1);
    saveRegionPolicyPromptConfig(config);
    res.json({
      success: true,
      message: '配置删除成功',
    });
  } catch (error) {
    console.error('删除地区政策报告 prompt 失败:', error);
    res.status(500).json({ error: '删除地区政策报告 prompt 失败' });
  }
});

// 获取地区政策报告 prompt 列表（前台使用）
app.get('/api/policy/region-report/prompts', async (req, res) => {
  try {
    const config = loadRegionPolicyPromptConfig();
    res.json((config.prompts || []).map(getRegionPromptSummary));
  } catch (error) {
    console.error('获取地区政策报告 prompt 列表失败:', error);
    res.status(500).json({ error: '获取地区政策报告 prompt 列表失败' });
  }
});

// ============ 扬州公积金政策管理 API ============

// 获取所有政策版本列表
app.get('/api/policy/versions', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const policiesDir = path.join(__dirname, 'config/policies');
    
    // 确保目录存在
    if (!fs.existsSync(policiesDir)) {
      fs.mkdirSync(policiesDir, { recursive: true });
      return res.json([]);
    }
    
    const files = fs.readdirSync(policiesDir);
    
    // 过滤JSON文件并获取详细信息
    const versions = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(policiesDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          createdAt: stats.birthtime,
          updatedAt: stats.mtime,
          size: stats.size
        };
      })
      // 按修改时间倒序排序（最新的在前）
      .sort((a, b) => b.updatedAt - a.updatedAt);
      
    res.json(versions);
  } catch (error) {
    console.error('获取政策版本列表失败:', error);
    res.status(500).json({ error: '获取政策版本列表失败', details: error.message });
  }
});

// 获取最新政策内容
app.get('/api/policy/latest', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const policiesDir = path.join(__dirname, 'config/policies');
    
    if (!fs.existsSync(policiesDir)) {
      return res.json({ content: null, filename: null });
    }
    
    const files = fs.readdirSync(policiesDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(policiesDir, file);
        return {
          filename: file,
          mtime: fs.statSync(filePath).mtime
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
      
    if (files.length === 0) {
      return res.json({ content: null, filename: null });
    }
    
    const latestFile = files[0];
    const filePath = path.join(policiesDir, latestFile.filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    res.json({
      filename: latestFile.filename,
      content: JSON.parse(content),
      lastUpdated: latestFile.mtime
    });
  } catch (error) {
    console.error('获取最新政策失败:', error);
    res.status(500).json({ error: '获取最新政策失败', details: error.message });
  }
});

// 保存新版政策（自动创建新版本）
app.post('/api/policy/save', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: '缺少政策内容' });
    }
    
    const policiesDir = path.join(__dirname, 'config/policies');
    if (!fs.existsSync(policiesDir)) {
      fs.mkdirSync(policiesDir, { recursive: true });
    }
    
    // 生成带时间戳的文件名
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, '').split('.')[0]; // YYYYMMDDHHmmss
    const filename = `policy_${timestamp}.json`;
    const filePath = path.join(policiesDir, filename);
    
    // 写入文件
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
    
    res.json({
      success: true,
      message: '新版本政策已保存',
      filename: filename,
      timestamp: now
    });
  } catch (error) {
    console.error('保存政策失败:', error);
    res.status(500).json({ error: '保存政策失败', details: error.message });
  }
});

// 政策抽取 (Step 1)
app.post('/api/policy/extract', async (req, res) => {
  const { reportContent, reportId } = req.body;
  
  if (!reportContent && !reportId) {
    return res.status(400).json({ error: 'Missing report content or ID' });
  }
  
  try {
    let contentToProcess = reportContent;
    
    // 如果提供了ID但没有内容，从数据库获取
    if (!contentToProcess && reportId) {
      const [rows] = await pool.query('SELECT report_content FROM weekly_reports WHERE id = ?', [reportId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }
      contentToProcess = rows[0].report_content;
    }
    
    const fs = require('fs');
    const path = require('path');
    
    // 获取最新政策内容作为模板
    let currentPolicyContent = '{}';
    const policiesDir = path.join(__dirname, 'config/policies');
    if (fs.existsSync(policiesDir)) {
      const files = fs.readdirSync(policiesDir)
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          filename: file,
          mtime: fs.statSync(path.join(policiesDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);
        
      if (files.length > 0) {
        const latestFile = path.join(policiesDir, files[0].filename);
        currentPolicyContent = fs.readFileSync(latestFile, 'utf-8');
      }
    }
    
    // 读取提示词
    const promptsPath = path.join(__dirname, 'config/policy_prompts.md');
    let promptsContent = '';
    if (fs.existsSync(promptsPath)) {
        promptsContent = fs.readFileSync(promptsPath, 'utf-8');
    }
    
    // 获取抽取提示词 (使用更宽松的正则)
    const extractionPromptMatch = promptsContent.match(/## Policy Extraction Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/);
    const systemPrompt = "你是一个专业的政策分析助手，请严格按照用户的要求提取政策信息并输出为JSON格式。";
    
    // 默认优化后的提示词 (从文件读取失败时的后备)
    const defaultExtractionPrompt = '';

    const userPromptTemplate = extractionPromptMatch ? extractionPromptMatch[1].trim() : defaultExtractionPrompt;
    
    if (!userPromptTemplate) {
        throw new Error('Policy Extraction Prompt not found in config/policy_prompts.md');
    }
    
    // 替换变量
    const finalUserPrompt = userPromptTemplate
      .replace('{report}', contentToProcess)
      .replace('{template}', currentPolicyContent);
    
    const sanitizeJsonLikeOutput = (s) => {
      const input = String(s ?? '');
      let out = '';
      let inString = false;
      let escaped = false;
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (inString) {
          if (escaped) {
            out += ch;
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            out += ch;
            escaped = true;
            continue;
          }
          if (ch === '"') {
            out += ch;
            inString = false;
            continue;
          }
          if (ch === '\n') {
            out += '\\n';
            continue;
          }
          if (ch === '\r') {
            continue;
          }
          out += ch;
          continue;
        }

        if (ch === '"') {
          out += ch;
          inString = true;
          escaped = false;
          continue;
        }
        out += ch;
      }
      return out;
    };

    const callDeepSeekJsonObject = async (userPrompt, options = {}) => {
      const {
        temperature = 0.3,
        maxTokens = 4096
      } = options || {};

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = '';
        }
        const snippet = (errorText || '').slice(0, 800);
        throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}${snippet ? ` | ${snippet}` : ''}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '{}';
    };

    const tryParse = (raw) => {
      const cleaned = sanitizeJsonLikeOutput(raw);
      return JSON.parse(cleaned);
    };

    let parsed;
    let firstResult = '';
    try {
      firstResult = await callDeepSeekJsonObject(finalUserPrompt, { temperature: 0.3, maxTokens: 4096 });
      parsed = tryParse(firstResult);
    } catch (e) {
      const eMsg = String(e?.message || e || '');
      const strictPrefix = [
        '【强制约束：为避免超长/截断导致JSON不完整，请严格执行】',
        '1) 仅输出一个JSON对象，且必须能被JSON.parse解析。',
        '2) 每条“政策明细”的“内容”请控制在120字以内；禁止换行、禁止使用\\n；用分号/逗号表达要点。',
        '3) 只保留关键数字与要素（对象/门槛/额度比例/期限/范围/流程关键点），不要写办理渠道/网址/过长材料清单。',
        '4) 若同城同类信息重复，请合并为1条更精炼的政策明细；优先保留数字最明确的条目。',
        '5) “依据文件”请尽量短（<=60字）。'
      ].join('\n');
      const strictPrompt = `${strictPrefix}\n\n${finalUserPrompt}`;

      const repairSystem = '你是一个严格的JSON修复器。你只输出可被JSON.parse解析的单一JSON对象，不要任何解释或markdown。';
      let strictResult = '';
      try {
        strictResult = await callDeepSeekJsonObject(strictPrompt, { temperature: 0.1, maxTokens: 4096 });
        parsed = tryParse(strictResult);
      } catch (strictErr) {
        const strictMsg = String(strictErr?.message || strictErr || '');
        const repairSource = strictResult || firstResult;
        const repairUser = [
          '请将下面文本修复为合法JSON对象：',
          '要求：',
          '1) 只输出一个JSON对象',
          '2) 不要多余文字',
          '3) 需要时将字符串中的换行转义为\\\\n，双引号转义为\\\"',
          '',
          '待修复文本：',
          String(repairSource || '').slice(0, 12000)
        ].join('\n');

        const repairResp = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: repairSystem },
              { role: 'user', content: repairUser }
            ],
            temperature: 0,
            max_tokens: 2048,
            response_format: { type: 'json_object' }
          })
        });

        if (repairResp.ok) {
          try {
            const repairData = await repairResp.json();
            const repaired = repairData.choices?.[0]?.message?.content || '{}';
            parsed = tryParse(repaired);
          } catch (repairErr) {
            const repairMsg = String(repairErr?.message || repairErr || '');
            throw new Error(`DeepSeek returned non-JSON content | ${eMsg} | strict_failed: ${strictMsg} | repair_failed: ${repairMsg}`);
          }
        } else {
          let repairText = '';
          try {
            repairText = await repairResp.text();
          } catch {}
          throw new Error(`DeepSeek returned non-JSON content | ${eMsg} | strict_failed: ${strictMsg} | repair_http_${repairResp.status}: ${(repairText || '').slice(0, 800)}`);
        }
      }
    }
    
    res.json({ 
      result: parsed,
      debug: {
        systemPrompt,
        userPrompt: finalUserPrompt
      }
    });
    
  } catch (error) {
    console.error('Policy extraction failed:', error);
    const msg = String(error?.message || error || '');
    res.status(500).json({ error: 'Extraction failed', details: msg.slice(0, 2000) });
  }
});

// 预览政策相关Prompt (Step 1 & 2)
app.post('/api/policy/preview-prompt', async (req, res) => {
  const { type, reportContent, reportId, extractedPolicy, currentPolicy } = req.body;
  // type: 'extraction' or 'comparison'
  
  try {
    const fs = require('fs');
    const path = require('path');
    const policiesDir = path.join(__dirname, 'config/policies');
    const promptsPath = path.join(__dirname, 'config/policy_prompts.md');
    
    let promptsContent = '';
    if (fs.existsSync(promptsPath)) {
        promptsContent = fs.readFileSync(promptsPath, 'utf-8');
    }
    
    let systemPrompt = '';
    let userPrompt = '';
    
    if (type === 'extraction') {
        let contentToProcess = reportContent;
        // 如果提供了ID但没有内容，从数据库获取
        if (!contentToProcess && reportId) {
            const [rows] = await pool.query('SELECT report_content FROM weekly_reports WHERE id = ?', [reportId]);
            if (rows.length > 0) {
                contentToProcess = rows[0].report_content;
            }
        }
        
        // 获取最新政策内容作为模板
        let currentPolicyContent = '{}';
        if (fs.existsSync(policiesDir)) {
          const files = fs.readdirSync(policiesDir)
            .filter(file => file.endsWith('.json'))
            .map(file => ({
              filename: file,
              mtime: fs.statSync(path.join(policiesDir, file)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime);
            
          if (files.length > 0) {
            const latestFile = path.join(policiesDir, files[0].filename);
            currentPolicyContent = fs.readFileSync(latestFile, 'utf-8');
          }
        }
        
        const extractionPromptMatch = promptsContent.match(/## Policy Extraction Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/);
        systemPrompt = "你是一个专业的政策分析助手，请严格按照用户的要求提取政策信息并输出为JSON格式。";
        const userPromptTemplate = extractionPromptMatch ? extractionPromptMatch[1].trim() : '';
        
        userPrompt = userPromptTemplate
          .replace('{report}', contentToProcess || '')
          .replace('{template}', currentPolicyContent);
          
    } else if (type === 'comparison') {
        // 如果未提供当前政策，读取最新的
        let currentPolicyContent = currentPolicy;
        if (!currentPolicyContent) {
           if (fs.existsSync(policiesDir)) {
             const files = fs.readdirSync(policiesDir)
               .filter(file => file.endsWith('.json'))
               .map(file => ({
                 filename: file,
                 mtime: fs.statSync(path.join(policiesDir, file)).mtime
               }))
               .sort((a, b) => b.mtime - a.mtime);
               
             if (files.length > 0) {
               const latestFile = path.join(policiesDir, files[0].filename);
               currentPolicyContent = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
             }
           }
        }
        
        const comparisonPromptMatch = promptsContent.match(/## Policy Comparison Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/);
        systemPrompt = "你是一个专业的政策对比分析专家。";
        const userPromptTemplate = comparisonPromptMatch ? comparisonPromptMatch[1].trim() : '请对比以下两份政策内容：\n\n现行政策：\n{current}\n\n新提取政策：\n{extracted}';
        
        userPrompt = userPromptTemplate
          .replace('{current}', JSON.stringify(currentPolicyContent || {}, null, 2))
          .replace('{extracted}', JSON.stringify(extractedPolicy || {}, null, 2));
    }
    
    res.json({
        systemPrompt,
        userPrompt
    });
    
  } catch (error) {
    console.error('Preview policy prompt failed:', error);
    res.status(500).json({ error: 'Preview failed', details: error.message });
  }
});

// 政策对比 (Step 2)
app.post('/api/policy/compare', async (req, res) => {
  const { extractedPolicy, currentPolicy } = req.body;
  
  if (!extractedPolicy) {
    return res.status(400).json({ error: 'Missing extracted policy' });
  }
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    // 如果未提供当前政策，读取最新的
    let currentPolicyContent = currentPolicy;
    if (!currentPolicyContent) {
       const policiesDir = path.join(__dirname, 'config/policies');
       if (fs.existsSync(policiesDir)) {
         const files = fs.readdirSync(policiesDir)
           .filter(file => file.endsWith('.json'))
           .map(file => ({
             filename: file,
             mtime: fs.statSync(path.join(policiesDir, file)).mtime
           }))
           .sort((a, b) => b.mtime - a.mtime);
           
         if (files.length > 0) {
           const latestFile = path.join(policiesDir, files[0].filename);
           currentPolicyContent = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
         }
       }
    }
    
    // 读取提示词
    const promptsPath = path.join(__dirname, 'config/policy_prompts.md');
    let promptsContent = '';
    if (fs.existsSync(promptsPath)) {
        promptsContent = fs.readFileSync(promptsPath, 'utf-8');
    }
    
    // 获取对比提示词 (使用更宽松的正则)
    const comparisonPromptMatch = promptsContent.match(/## Policy Comparison Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/);
    const systemPrompt = "你是一个专业的政策对比分析专家。";
    const userPromptTemplate = comparisonPromptMatch ? comparisonPromptMatch[1].trim() : '请对比以下两份政策内容：\n\n现行政策：\n{current}\n\n新提取政策：\n{extracted}';
    
    const finalUserPrompt = userPromptTemplate
      .replace('{current}', JSON.stringify(currentPolicyContent, null, 2))
      .replace('{extracted}', JSON.stringify(extractedPolicy, null, 2));
      
    // 调用 DeepSeek R1 (Reasoner for complex comparison)
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
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const markdown = data.choices?.[0]?.message?.content || '对比生成失败';
    
    res.json({ 
      markdown,
      debug: {
        systemPrompt,
        userPrompt: finalUserPrompt
      }
    });
    
  } catch (error) {
    console.error('Policy comparison failed:', error);
    res.status(500).json({ error: 'Comparison failed', details: error.message });
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
    const keywords = ['养老', '公积金', '政府基金', '江苏省国资委', '数字政务', '高考', '中国烟草', '潜在招标客户', '江苏地区银行'];
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
        AND fetchdate < ?
        AND fetchdate IS NOT NULL
      GROUP BY DATE(fetchdate), keyword
      ORDER BY DATE(fetchdate) DESC, keyword
    `, [keywords, startDateStr, getNextDateYmd(endDateStr)]);
    
    // 针对“江苏省国资委”，按 search_keyword 统计定制爬取与微信公众号明细
    const [customDetailRows] = await pool.query(`
      SELECT 
        DATE(fetchdate) as fetchdate,
        COALESCE(search_keyword, '') as search_keyword,
        COUNT(*) as count
      FROM scored_news
      WHERE keyword = '江苏省国资委'
        AND fetchdate >= ?
        AND fetchdate < ?
        AND fetchdate IS NOT NULL
        AND TRIM(COALESCE(sourceapi, '')) = '定制爬取'
      GROUP BY DATE(fetchdate), COALESCE(search_keyword, '')
      ORDER BY DATE(fetchdate) DESC
    `, [startDateStr, getNextDateYmd(endDateStr)]);

    const [wechatDetailRows] = await pool.query(`
      SELECT 
        DATE(fetchdate) as fetchdate,
        COALESCE(search_keyword, '') as search_keyword,
        COUNT(*) as count
      FROM scored_news
      WHERE keyword = '江苏省国资委'
        AND fetchdate >= ?
        AND fetchdate < ?
        AND fetchdate IS NOT NULL
        AND TRIM(COALESCE(sourceapi, '')) = '极致了api'
      GROUP BY DATE(fetchdate), COALESCE(search_keyword, '')
      ORDER BY DATE(fetchdate) DESC
    `, [startDateStr, getNextDateYmd(endDateStr)]);

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

// ============ 历史周报相关 API ============

app.post('/api/reports/export-pdf', async (req, res) => {
  const {
    keyword,
    startDate,
    endDate,
    newsCount,
    modelName,
    reportContent,
    includeContact,
  } = req.body || {};

  if (!keyword || !startDate || !endDate || !reportContent) {
    return res.status(400).json({ error: '缺少导出 PDF 所需参数' });
  }

  try {
    const pdfBuffer = await renderReportPdf({
      keyword,
      startDate,
      endDate,
      newsCount: Number(newsCount) || 0,
      modelName,
      reportContent,
      includeContact: Boolean(includeContact),
    });

    const filename = buildReportPdfFilename({
      keyword,
      modelName,
      includeContact: Boolean(includeContact),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Content-Disposition', buildAttachmentDisposition(filename));
    res.send(pdfBuffer);
  } catch (error) {
    console.error('周报 PDF 导出失败:', error);

    if (error instanceof PdfRendererUnavailableError || error?.code === 'PDF_RENDERER_UNAVAILABLE') {
      return res.status(503).json({
        error: 'PDF 引擎不可用',
        details: error.message,
      });
    }

    return res.status(500).json({
      error: 'PDF 生成失败',
      details: error.message,
    });
  }
});

app.post('/api/policy/comparison/export-pdf', async (req, res) => {
  const {
    title,
    startDate,
    endDate,
    sourceMode,
    structuredReport,
  } = req.body || {};

  const isStructuredReportValid =
    structuredReport &&
    Array.isArray(structuredReport.intro) &&
    Array.isArray(structuredReport.cities) &&
    Array.isArray(structuredReport.missing);

  if (!title || !startDate || !endDate || !isStructuredReportValid) {
    return res.status(400).json({ error: '缺少政策对比导出 PDF 所需参数' });
  }

  try {
    const pdfBuffer = await renderPolicyComparisonPdf({
      title,
      startDate,
      endDate,
      sourceMode,
      structuredReport,
    });

    const filename = buildPolicyComparisonPdfFilename({
      title,
      startDate,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Content-Disposition', buildAttachmentDisposition(filename));
    res.send(pdfBuffer);
  } catch (error) {
    console.error('政策对比 PDF 导出失败:', error);

    if (error instanceof PdfRendererUnavailableError || error?.code === 'PDF_RENDERER_UNAVAILABLE') {
      return res.status(503).json({
        error: 'PDF 引擎不可用',
        details: error.message,
      });
    }

    return res.status(500).json({
      error: '政策对比 PDF 生成失败',
      details: error.message,
    });
  }
});

// 获取历史周报列表（支持分页和筛选）
app.get('/api/reports/history', async (req, res) => {
  try {
    const {
      keyword,
      startDate,
      endDate,
      model,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    // 构建 WHERE 条件
    const conditions = [];
    const params = [];

    if (keyword) {
      conditions.push('keyword LIKE ?');
      params.push(`%${keyword}%`);
    }

    if (startDate) {
      conditions.push('start_date >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('end_date <= ?');
      params.push(endDate);
    }

    if (model) {
      conditions.push('model_used = ?');
      params.push(model);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 计算总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM weekly_reports
      ${whereClause}
    `;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    // 查询数据
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const dataQuery = `
      SELECT
        id,
        keyword,
        start_date,
        end_date,
        LEFT(report_content, 200) as report_preview,
        model_used,
        news_count,
        created_at
      FROM weekly_reports
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataQuery, [...params, parseInt(limit), offset]);

    res.json({
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('获取历史周报列表失败:', error);
    res.status(500).json({ error: '获取历史周报列表失败', details: error.message });
  }
});

// 获取单个周报详情
app.get('/api/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM weekly_reports WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '报告不存在' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('获取周报详情失败:', error);
    res.status(500).json({ error: '获取周报详情失败', details: error.message });
  }
});

// 删除周报
app.delete('/api/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      'DELETE FROM weekly_reports WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '报告不存在' });
    }

    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除周报失败:', error);
    res.status(500).json({ error: '删除周报失败', details: error.message });
  }
});

// 获取所有关键词（用于筛选）
app.get('/api/reports/keywords/list', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT keyword FROM weekly_reports ORDER BY keyword'
    );
    res.json(rows.map(r => r.keyword));
  } catch (error) {
    console.error('获取关键词列表失败:', error);
    res.status(500).json({ error: '获取关键词列表失败', details: error.message });
  }
});

// ============================================
// 地域政策相关 API
// ============================================

// 国外/境外地区列表（需要过滤）
const foreignRegions = ['新加坡', '日本', '韩国', '美国', '英国', '法国', '德国', '澳大利亚', '加拿大', '新西兰', '泰国', '马来西亚', '越南', '菲律宾', '印度尼西亚', '印度'];

// 纯省级名称映射（如"湖南"映射到"湖南省"）
const provinceNameMap = {
  '北京': '北京市', '上海': '上海市', '天津': '天津市', '重庆': '重庆市',
  '江苏': '江苏省', '浙江': '浙江省', '广东': '广东省', '山东': '山东省',
  '河南': '河南省', '四川': '四川省', '湖北': '湖北省', '湖南': '湖南省',
  '河北': '河北省', '福建': '福建省', '安徽': '安徽省', '辽宁': '辽宁省',
  '陕西': '陕西省', '江西': '江西省', '黑龙江': '黑龙江省', '吉林': '吉林省',
  '云南': '云南省', '贵州': '贵州省', '山西': '山西省', '广西': '广西壮族自治区',
  '内蒙古': '内蒙古自治区', '新疆': '新疆维吾尔自治区', '西藏': '西藏自治区',
  '宁夏': '宁夏回族自治区', '青海': '青海省', '甘肃': '甘肃省', '海南': '海南省',
  '台湾': '台湾省', '香港': '香港特别行政区', '澳门': '澳门特别行政区'
};

// 直辖市列表
const municipalities = ['北京', '上海', '天津', '重庆', '北京市', '上海市', '天津市', '重庆市'];

// 判断是否为国外/境外地区
function isForeignRegion(region) {
  if (!region) return true;
  return foreignRegions.some(foreign => region.includes(foreign));
}

// 地域分级识别函数
function classifyRegion(region) {
  if (!region) return null;

  // 过滤国外数据
  if (isForeignRegion(region)) {
    return null;
  }

  // 全国级
  if (region === '全国') {
    return { level: 'national', name: '全国', parent: null };
  }

  // 直辖市（与省级同层级）
  if (municipalities.includes(region)) {
    const shortName = region.replace('市', '');
    return { level: 'municipality', name: shortName + '市', parent: '全国' };
  }

  // 省级（以"省"、"自治区"结尾）
  if (region.endsWith('省') || region.endsWith('自治区') || region.endsWith('特别行政区')) {
    return { level: 'province', name: region, parent: '全国' };
  }

  // 纯省级名称（如"湖南"）
  if (provinceNameMap[region]) {
    return { level: 'province', name: provinceNameMap[region], parent: '全国', isShortName: true };
  }

  // 其他视为市级
  return { level: 'city', name: region, parent: null };
}

// 拆分多地域（以|分隔）
function splitMultiRegion(regionStr) {
  if (!regionStr) return [];
  return regionStr.split('|').map(r => r.trim()).filter(r => r && !isForeignRegion(r));
}

// 省份-城市映射表（用于识别城市所属省份）
const provinceCityMap = {
  '江苏省': ['南京', '苏州', '无锡', '常州', '扬州', '镇江', '泰州', '南通', '盐城', '淮安', '宿迁', '连云港', '徐州'],
  '浙江省': ['杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水'],
  '广东省': ['广州', '深圳', '珠海', '汕头', '佛山', '韶关', '湛江', '肇庆', '江门', '茂名', '惠州', '梅州', '汕尾', '河源', '阳江', '清远', '东莞', '中山', '潮州', '揭阳', '云浮'],
  '山东省': ['济南', '青岛', '淄博', '枣庄', '东营', '烟台', '潍坊', '济宁', '泰安', '威海', '日照', '临沂', '德州', '聊城', '滨州', '菏泽'],
  '河南省': ['郑州', '开封', '洛阳', '平顶山', '安阳', '鹤壁', '新乡', '焦作', '濮阳', '许昌', '漯河', '三门峡', '南阳', '商丘', '信阳', '周口', '驻马店'],
  '四川省': ['成都', '自贡', '攀枝花', '泸州', '德阳', '绵阳', '广元', '遂宁', '内江', '乐山', '南充', '眉山', '宜宾', '广安', '达州', '雅安', '巴中', '资阳', '阿坝', '甘孜', '凉山'],
  '湖北省': ['武汉', '黄石', '十堰', '宜昌', '襄阳', '鄂州', '荆门', '孝感', '荆州', '黄冈', '咸宁', '随州', '恩施', '仙桃', '潜江', '天门', '神农架'],
  '湖南省': ['长沙', '株洲', '湘潭', '衡阳', '邵阳', '岳阳', '常德', '张家界', '益阳', '郴州', '永州', '怀化', '娄底', '湘西'],
  '河北省': ['石家庄', '唐山', '秦皇岛', '邯郸', '邢台', '保定', '张家口', '承德', '沧州', '廊坊', '衡水'],
  '福建省': ['福州', '厦门', '莆田', '三明', '泉州', '漳州', '南平', '龙岩', '宁德'],
  '安徽省': ['合肥', '芜湖', '蚌埠', '淮南', '马鞍山', '淮北', '铜陵', '安庆', '黄山', '滁州', '阜阳', '宿州', '六安', '亳州', '池州', '宣城'],
  '辽宁省': ['沈阳', '大连', '鞍山', '抚顺', '本溪', '丹东', '锦州', '营口', '阜新', '辽阳', '盘锦', '铁岭', '朝阳', '葫芦岛'],
  '陕西省': ['西安', '铜川', '宝鸡', '咸阳', '渭南', '延安', '汉中', '榆林', '安康', '商洛'],
  '江西省': ['南昌', '景德镇', '萍乡', '九江', '新余', '鹰潭', '赣州', '吉安', '宜春', '抚州', '上饶'],
  '黑龙江省': ['哈尔滨', '齐齐哈尔', '鸡西', '鹤岗', '双鸭山', '大庆', '伊春', '佳木斯', '七台河', '牡丹江', '黑河', '绥化', '大兴安岭'],
  '吉林省': ['长春', '吉林', '四平', '辽源', '通化', '白山', '松原', '白城', '延边', '长白山'],
  '云南省': ['昆明', '曲靖', '玉溪', '保山', '昭通', '丽江', '普洱', '临沧', '楚雄', '红河', '文山', '西双版纳', '大理', '德宏', '怒江', '迪庆'],
  '贵州省': ['贵阳', '六盘水', '遵义', '安顺', '毕节', '铜仁', '黔西南', '黔东南', '黔南'],
  '山西省': ['太原', '大同', '阳泉', '长治', '晋城', '朔州', '晋中', '运城', '忻州', '临汾', '吕梁'],
  '广西壮族自治区': ['南宁', '柳州', '桂林', '梧州', '北海', '防城港', '钦州', '贵港', '玉林', '百色', '贺州', '河池', '来宾', '崇左'],
  '内蒙古自治区': ['呼和浩特', '包头', '乌海', '赤峰', '通辽', '鄂尔多斯', '呼伦贝尔', '巴彦淖尔', '乌兰察布', '兴安', '锡林郭勒', '阿拉善'],
  '新疆维吾尔自治区': ['乌鲁木齐', '克拉玛依', '吐鲁番', '哈密', '昌吉', '博尔塔拉', '巴音郭楞', '阿克苏', '克孜勒苏', '喀什', '和田', '伊犁', '塔城', '阿勒泰', '石河子', '阿拉尔', '图木舒克', '五家渠', '北屯', '铁门关', '双河', '可克达拉', '昆玉', '胡杨河', '新星'],
  '西藏自治区': ['拉萨', '日喀则', '昌都', '林芝', '山南', '那曲', '阿里'],
  '宁夏回族自治区': ['银川', '石嘴山', '吴忠', '固原', '中卫'],
  '青海省': ['西宁', '海东', '海北', '黄南', '海南', '果洛', '玉树', '海西'],
  '甘肃省': ['兰州', '嘉峪关', '金昌', '白银', '天水', '武威', '张掖', '平凉', '酒泉', '庆阳', '定西', '陇南', '临夏', '甘南'],
  '海南省': ['海口', '三亚', '三沙', '儋州', '五指山', '琼海', '文昌', '万宁', '东方', '定安', '屯昌', '澄迈', '临高', '白沙', '昌江', '乐东', '陵水', '保亭', '琼中'],
  '台湾省': ['台北', '新北', '桃园', '台中', '台南', '高雄', '基隆', '新竹', '嘉义'],
  '香港特别行政区': ['香港'],
  '澳门特别行政区': ['澳门']
};

// 获取城市所属省份
function getCityProvince(cityName) {
  for (const [province, cities] of Object.entries(provinceCityMap)) {
    if (cities.includes(cityName)) {
      return province;
    }
  }
  return null;
}

function getSelectionDisplayName(selection) {
  if (!selection) return '';
  return selection.level === 'provincial' ? `${selection.name}（省级）` : selection.name;
}

function normalizeRegionSelection(input) {
  if (!input) return null;

  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return null;
    if (text.startsWith('{')) {
      try {
        return normalizeRegionSelection(JSON.parse(text));
      } catch {
        return null;
      }
    }
    const [level, ...rest] = text.split('::');
    if (!level || rest.length === 0) return null;
    const name = rest.join('::').trim();
    if (!name) return null;
    return {
      name,
      level: level.trim(),
      label: getSelectionDisplayName({ name, level: level.trim() }),
    };
  }

  if (typeof input === 'object') {
    const name = String(input.name || '').trim();
    const level = String(input.level || '').trim();
    if (!name || !level) return null;
    return {
      name,
      level,
      label: String(input.label || '').trim() || getSelectionDisplayName({ name, level }),
    };
  }

  return null;
}

function normalizeRegionSelections(input) {
  const list = Array.isArray(input) ? input : (input ? [input] : []);
  const deduped = new Map();
  list.forEach((item) => {
    const normalized = normalizeRegionSelection(item);
    if (!normalized) return;
    deduped.set(`${normalized.level}::${normalized.name}`, normalized);
  });
  return Array.from(deduped.values());
}

function getMatchedRegionsForSelection(regionStr, selection) {
  const splitRegions = splitMultiRegion(regionStr);
  if (!selection || splitRegions.length === 0) return [];

  const matches = splitRegions.filter((part) => {
    const classified = classifyRegion(part);
    if (!classified) return false;

    if (selection.level === 'national') {
      return classified.level === 'national';
    }

    if (selection.level === 'municipality') {
      return classified.level === 'municipality' && classified.name === selection.name;
    }

    if (selection.level === 'province') {
      if (classified.level === 'province' && classified.name === selection.name) {
        return true;
      }
      if (classified.level === 'city') {
        return getCityProvince(classified.name) === selection.name;
      }
      return false;
    }

    if (selection.level === 'provincial') {
      return classified.level === 'province' && classified.name === selection.name;
    }

    if (selection.level === 'city') {
      return classified.level === 'city' && classified.name === selection.name;
    }

    return false;
  });

  return Array.from(new Set(matches));
}

function splitTextIntoSentences(text = '') {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatPolicyDateYmd(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const raw = String(value);
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
  }
  return date.toISOString().slice(0, 10);
}

const REGION_POLICY_NOISE_PATTERNS = [
  /问答/,
  /答疑/,
  /知识问答/,
  /热点问答/,
  /常见问题/,
  /知识库/,
  /政策科普/,
  /办事指南/,
  /操作指南/,
  /办理指南/,
  /办理流程/,
  /服务指南/,
  /攻略/,
  /流程说明/,
  /使用说明/,
  /图解/,
  /一图读懂/,
  /指引/,
  /手把手/,
  /如何/,
  /怎么/,
  /FAQ/i,
];

const REGION_POLICY_FINANCIAL_RESERVE_PATTERNS = [
  /弥补亏损/,
  /盈余公积/,
  /债权人/,
  /证券代码/,
  /公司公告/,
  /董事会/,
  /股东/,
  /上市公司/,
];

const REGION_POLICY_OLD_POLICY_PATTERNS = [
  /政策回顾/,
  /历史政策/,
  /旧政策/,
  /政策沿革/,
  /盘点/,
  /梳理/,
  /汇总/,
  /合集/,
  /历年来/,
  /此前政策/,
  /既有政策/,
];

const REGION_POLICY_INTERPRETATION_PATTERNS = [
  /政策解读/,
  /权威解读/,
  /专家解读/,
  /媒体解读/,
  /条文解读/,
];

const REGION_POLICY_ACTION_PATTERNS = [
  /发布/,
  /印发/,
  /通知/,
  /通告/,
  /出台/,
  /实施/,
  /执行/,
  /调整/,
  /优化/,
  /提高/,
  /降低/,
  /上调/,
  /下调/,
  /放宽/,
  /收紧/,
  /修订/,
  /明确/,
  /细化/,
  /延长/,
  /缩短/,
  /取消/,
  /支持/,
  /推进/,
  /推出/,
  /新增/,
  /恢复/,
  /阶段性/,
  /暂行/,
  /办法/,
  /措施/,
  /新政/,
];

function getRegionPolicySourceText(news = {}) {
  return [news.title, news.short_summary, news.content].filter(Boolean).join('\n');
}

function extractPolicySnippet(news = {}, maxLength = 150) {
  const summary = String(news.short_summary || '').trim();
  if (summary) {
    return summary.length > maxLength ? `${summary.slice(0, maxLength)}...` : summary;
  }
  const sourceText = getRegionPolicySourceText(news);
  const sentences = splitTextIntoSentences(sourceText);
  const actionSentences = sentences.filter((sentence) =>
    REGION_POLICY_ACTION_PATTERNS.some((pattern) => pattern.test(sentence))
  );
  const chosen = (actionSentences.length > 0 ? actionSentences : sentences).slice(0, 3).join('；');
  const compact = chosen.replace(/\s+/g, ' ').trim();
  if (!compact) return '未提取到有效摘要';
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function analyzeRegionPolicyNews(news = {}) {
  const title = String(news.title || '').trim();
  const sourceText = getRegionPolicySourceText(news);
  const compactText = sourceText.replace(/\s+/g, ' ').trim();
  const hasAction = REGION_POLICY_ACTION_PATTERNS.some((pattern) => pattern.test(compactText));
  const titleAndSummary = `${title}\n${String(news.short_summary || '')}`;

  if (REGION_POLICY_FINANCIAL_RESERVE_PATTERNS.some((pattern) => pattern.test(titleAndSummary))) {
    return { includedInAnalysis: false, filterReason: '企业财务公积金/公告类内容' };
  }

  if (REGION_POLICY_NOISE_PATTERNS.some((pattern) => pattern.test(titleAndSummary))) {
    return { includedInAnalysis: false, filterReason: '政策问答/指南类内容' };
  }

  if (REGION_POLICY_INTERPRETATION_PATTERNS.some((pattern) => pattern.test(titleAndSummary)) && !hasAction) {
    return { includedInAnalysis: false, filterReason: '政策解读但无明确新政动作' };
  }

  if (REGION_POLICY_OLD_POLICY_PATTERNS.some((pattern) => pattern.test(titleAndSummary)) && !hasAction) {
    return { includedInAnalysis: false, filterReason: '历史政策回顾或汇总' };
  }

  if (!hasAction) {
    return { includedInAnalysis: false, filterReason: '缺少明确政策动作信号' };
  }

  return { includedInAnalysis: true, filterReason: '纳入分析' };
}

function applyRegionPolicyManualOverride(row, manualOverrides = {}) {
  const overrideValue = manualOverrides?.[String(row.id)];
  if (typeof overrideValue !== 'boolean') {
    return row;
  }

  return {
    ...row,
    includedInAnalysis: overrideValue,
    filterReason: overrideValue ? '人工纳入' : '人工排除',
    filterSource: 'manual',
  };
}

function summarizeRegionPolicyNews(newsList = [], maxLength = 500) {
  if (!Array.isArray(newsList) || newsList.length === 0) {
    return '当前筛选周期内暂无可纳入分析的政策新闻。';
  }

  const ordered = [...newsList].sort((a, b) => new Date(a.fetchdate || 0) - new Date(b.fetchdate || 0));
  const parts = [];

  for (const news of ordered) {
    const dateText = news.fetchdate ? formatPolicyDateYmd(news.fetchdate) : '日期不详';
    const fullSummary = String(news.short_summary || '').trim();
    const snippet = fullSummary || extractPolicySnippet(news, 120);
    const part = `${dateText} ${news.title || '未命名新闻'}：${snippet}`;
    parts.push(part);
  }

  const summary = parts.join('\n').trim();
  if (!summary) {
    const fallback = extractPolicySnippet(ordered[0], 480);
    return fallback;
  }
  return summary;
}

function formatRegionCoverage(newsList = []) {
  if (!Array.isArray(newsList) || newsList.length === 0) return '无';
  const sorted = [...newsList]
    .map((item) => item.fetchdate ? formatPolicyDateYmd(item.fetchdate) : '')
    .filter(Boolean)
    .sort();
  if (sorted.length === 0) return '无';
  return `${sorted[0]} 至 ${sorted[sorted.length - 1]}`;
}

function buildRegionBlock(selection, newsList = []) {
  const header = [
    `地区名称：${getSelectionDisplayName(selection)}`,
    `政策新闻数量：${newsList.length}`,
    `时间覆盖：${formatRegionCoverage(newsList)}`,
    `地区政策摘要（<=500字）：`,
    summarizeRegionPolicyNews(newsList, 500),
    '政策新闻清单：',
  ];

  const lines = newsList.map((news) => {
    const dateText = news.fetchdate ? formatPolicyDateYmd(news.fetchdate) : '日期不详';
    const fullSummary = String(news.short_summary || '').trim();
    const snippet = fullSummary || extractPolicySnippet(news, 140);
    return `- ${dateText}｜${news.title || '未命名新闻'}｜来源：${news.source || '未知'}｜地区：${news.region || selection.name}｜摘要：${snippet}`;
  });

  return `## ${getSelectionDisplayName(selection)}\n${header.join('\n')}\n${lines.join('\n')}`;
}

function fillPromptTemplate(template, variables) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      return variables[key];
    }
    return '';
  });
}

function resolveRegionReportPrompt(prompts = [], promptId, selectionCount = 0) {
  const promptById = promptId ? prompts.find((item) => item.id === promptId) : null;
  const recommendedId = selectionCount === 1 ? 'single-region-default' : 'multi-region-default';
  return (
    promptById ||
    prompts.find((item) => item.id === recommendedId) ||
    prompts.find((item) => item.isDefault) ||
    prompts[0] ||
    null
  );
}

function isContextLengthErrorText(text = '') {
  const content = String(text || '').toLowerCase();
  return (
    content.includes('context length') ||
    content.includes('token limit') ||
    content.includes('maximum context') ||
    content.includes('context window') ||
    content.includes('too many tokens')
  );
}

async function fetchRegionPolicyRows({ startDate, endDate, selections }) {
  const params = [REGION_POLICY_REPORT_KEYWORD];
  let whereClause = `WHERE keyword = ? AND region IS NOT NULL AND region != '' AND score >= 3`;

  if (startDate) {
    whereClause += ' AND fetchdate >= ?';
    params.push(startDate);
  }
  if (endDate) {
    whereClause += ' AND fetchdate < ?';
    params.push(getNextDateYmd(endDate));
  }

  const [rows] = await pool.query(`
    SELECT
      id, title, content, link, source, score,
      keyword, search_keyword, fetchdate, wordcount,
      sourceapi, short_summary, region
    FROM scored_news
    ${whereClause}
    ORDER BY fetchdate DESC, id DESC
  `, params);

  const filtered = rows
    .map((row) => {
      const matchedSelections = selections
        .map((selection) => ({
          selection,
          matchedRegions: getMatchedRegionsForSelection(row.region, selection),
        }))
        .filter((item) => item.matchedRegions.length > 0);

      if (matchedSelections.length === 0) return null;

      return {
        ...row,
        matchedSelections: matchedSelections.map((item) => ({
          name: item.selection.name,
          level: item.selection.level,
          label: item.selection.label,
          matchedRegions: item.matchedRegions,
        })),
      };
    })
    .filter(Boolean);

  const deduped = new Map();
  filtered.forEach((row) => {
    if (!deduped.has(row.id)) {
      deduped.set(row.id, row);
    }
  });

  return Array.from(deduped.values());
}

// 获取地域列表（带统计和层级结构）
app.get('/api/policy/regions', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = ['公积金'];

    if (startDate && endDate) {
      dateFilter = ' AND fetchdate >= ? AND fetchdate < ?';
      params.push(startDate, getNextDateYmd(endDate));
    }

    // 查询各地域的新闻（不过滤，先获取原始数据）
    const [rows] = await pool.query(`
      SELECT region, COUNT(*) as count, AVG(score) as avgScore
      FROM scored_news
      WHERE keyword = ?
        AND region IS NOT NULL
        AND region != ''
        AND score >= 3
        ${dateFilter}
      GROUP BY region
      ORDER BY count DESC
    `, params);

    // 构建层级结构
    const regionTree = {
      national: { name: '全国', count: 0, avgScore: 0, children: [] },
      provinces: {},
      municipalities: {} // 直辖市单独处理
    };

    // 统计计数器（处理多地域拆分后的计数）
    const regionStats = {};

    rows.forEach(row => {
      // 拆分多地域
      const regions = splitMultiRegion(row.region);
      if (regions.length === 0) return;

      // 每个地域都计入统计（一条新闻可能属于多个地域）
      regions.forEach(regionName => {
        if (!regionStats[regionName]) {
          regionStats[regionName] = { count: 0, totalScore: 0 };
        }
        regionStats[regionName].count += row.count;
        regionStats[regionName].totalScore += parseFloat(row.avgScore || 0) * row.count;
      });
    });

    // 处理统计数据并构建树
    Object.entries(regionStats).forEach(([regionName, stats]) => {
      const classified = classifyRegion(regionName);
      if (!classified) return;

      const avgScore = (stats.totalScore / stats.count).toFixed(2);

      if (classified.level === 'national') {
        regionTree.national.count = stats.count;
        regionTree.national.avgScore = avgScore;
      } else if (classified.level === 'municipality') {
        // 直辖市与省级同层级
        regionTree.municipalities[classified.name] = {
          name: classified.name,
          count: stats.count,
          avgScore: avgScore,
          type: 'municipality'
        };
      } else if (classified.level === 'province') {
        const provinceName = classified.name;
        if (!regionTree.provinces[provinceName]) {
          regionTree.provinces[provinceName] = {
            name: provinceName,
            count: 0,
            avgScore: 0,
            children: [],
            hasProvincialNews: false
          };
        }

        // 纯省级名称（如"湖南"）算作省级新闻
        if (classified.isShortName) {
          regionTree.provinces[provinceName].children.push({
            name: '省级',
            count: stats.count,
            avgScore: avgScore,
            type: 'provincial'
          });
          regionTree.provinces[provinceName].hasProvincialNews = true;
        }
        regionTree.provinces[provinceName].count += stats.count;
      } else if (classified.level === 'city') {
        const provinceName = getCityProvince(regionName) || '其他';
        if (!regionTree.provinces[provinceName]) {
          regionTree.provinces[provinceName] = {
            name: provinceName,
            count: 0,
            avgScore: 0,
            children: [],
            hasProvincialNews: false
          };
        }
        regionTree.provinces[provinceName].children.push({
          name: regionName,
          count: stats.count,
          avgScore: avgScore,
          type: 'city'
        });
        regionTree.provinces[provinceName].count += stats.count;
      }
    });

    // 计算各省份平均分
    Object.values(regionTree.provinces).forEach(province => {
      if (province.children.length > 0) {
        const totalScore = province.children.reduce((sum, child) => sum + parseFloat(child.avgScore || 0) * child.count, 0);
        province.avgScore = (totalScore / province.count).toFixed(2);
      }
    });

    res.json(regionTree);
  } catch (error) {
    console.error('获取地域列表失败:', error);
    res.status(500).json({ error: '获取地域列表失败', details: error.message });
  }
});

// 按地域获取新闻
app.get('/api/policy/region-news', async (req, res) => {
  try {
    const {
      region,
      regionLevel = 'city', // 'national' | 'province' | 'city' | 'municipality' | 'provincial'
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
      sortBy = 'fetchdate',
      order = 'desc'
    } = req.query;

    if (!region) {
      return res.status(400).json({ error: '地域参数必填' });
    }

    const validSortFields = ['fetchdate', 'score', 'title', 'source'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'fetchdate';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // 构建查询条件
    let whereClause = 'WHERE keyword = ? AND score >= 3';
    const params = ['公积金'];

    if (regionLevel === 'national') {
      whereClause += ' AND region = ?';
      params.push('全国');
    } else if (regionLevel === 'province') {
      // 省级查询：包含该省省级新闻和下属所有城市的新闻
      const cities = provinceCityMap[region] || [];
      // 纯省级名称（如"湖南"）也要匹配
      const shortProvinceName = region.replace('省', '').replace('自治区', '').replace('特别行政区', '');
      const regionConditions = [
        `region = ?`,
        `region LIKE ?`,  // 匹配纯省级名称
        ...cities.map(() => 'region LIKE ?')  // 使用LIKE匹配多地域中的城市
      ];
      whereClause += ` AND (${regionConditions.join(' OR ')})`;
      params.push(region, `%${shortProvinceName}%`, ...cities.map(() => `%|%`));
      // 重新构建params，需要更精确的匹配
      params.length = 1; // 重置params
      params.push(region);
      // 纯省级名称匹配（region字段完全等于或包含在|分隔的列表中）
      params.push(shortProvinceName);
      // 城市匹配（城市名可能在多地域字段中）
      cities.forEach(city => params.push(city));

      // 重新构建SQL
      const cityConditions = cities.map(() => `
        region = ? OR
        region LIKE CONCAT('%', ?, '%') OR
        region LIKE CONCAT('%', ?, '|%') OR
        region LIKE CONCAT('%|', ?, '%')
      `).join(' OR ');

      whereClause = `WHERE keyword = ? AND (
        region = ? OR
        region = ? OR
        ${cityConditions ? cityConditions : '1=0'}
      )`;

      // 重新构建params
      const newParams = ['公积金', region, shortProvinceName];
      cities.forEach(city => {
        newParams.push(city, city, city, city);
      });
      params.length = 0;
      params.push(...newParams);

    } else if (regionLevel === 'municipality') {
      // 直辖市查询
      const shortName = region.replace('市', '');
      whereClause += ` AND (region = ? OR region = ? OR region LIKE ? OR region LIKE ? OR region LIKE ?)`;
      params.push(region, shortName, `%${region}%`, `%${shortName}%`, `%${shortName}|%`);
    } else if (regionLevel === 'provincial') {
      // 纯省级新闻（如"湖南"而非"湖南省"）
      const shortName = region.replace('省', '').replace('自治区', '').replace('特别行政区', '');
      whereClause += ` AND (region = ? OR region LIKE ? OR region LIKE ? OR region LIKE ?)`;
      params.push(shortName, `%${shortName}|%`, `%|${shortName}%`, `%|${shortName}|%`);
    } else {
      // 市级查询（支持多地域匹配）
      // 使用 CONCAT('|', region, '|') 技巧来处理 | 分隔的多地域字段
      // 例如：region='湖南|娄底' -> '|湖南|娄底|'，可以匹配 '%|娄底|%'
      whereClause += ` AND (
        region = ? OR
        region LIKE CONCAT(?, '|%') OR
        region LIKE CONCAT('%|', ?) OR
        region LIKE CONCAT('%|', ?, '|%') OR
        CONCAT('|', region, '|') LIKE CONCAT('%|', ?, '|%')
      )`;
      params.push(region, region, region, region, region);
    }

    // 过滤国外数据
    const foreignExcludes = foreignRegions.map(() => 'region NOT LIKE ?').join(' AND ');
    if (foreignRegions.length > 0) {
      whereClause += ` AND (${foreignExcludes})`;
      foreignRegions.forEach(fr => params.push(`%${fr}%`));
    }

    if (startDate && endDate) {
      whereClause += ' AND fetchdate >= ? AND fetchdate < ?';
      params.push(startDate, getNextDateYmd(endDate));
    }

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM scored_news ${whereClause}`;
    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0].total;

    // 查询数据
    const dataSql = `
      SELECT
        id, title, content, link, source, score,
        keyword, search_keyword, fetchdate, wordcount,
        sourceapi, short_summary, region
      FROM scored_news
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize)];
    const [rows] = await pool.query(dataSql, dataParams);

    res.json({
      rows,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / parseInt(pageSize))
    });
  } catch (error) {
    console.error('获取地域新闻失败:', error);
    res.status(500).json({ error: '获取地域新闻失败', details: error.message });
  }
});

app.get('/api/policy/region-report/news', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const selections = normalizeRegionSelections(req.query.regions || req.query.selections);

    if (!startDate || !endDate) {
      return res.status(400).json({ error: '请选择完整日期区间' });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: '开始日期不能晚于结束日期' });
    }

    if (selections.length === 0) {
      return res.status(400).json({ error: '请至少选择一个地区' });
    }

    const rawRows = await fetchRegionPolicyRows({ startDate, endDate, selections });
    const rows = rawRows.map((row) => {
      const analysis = analyzeRegionPolicyNews(row);
      return {
        ...row,
        includedInAnalysis: analysis.includedInAnalysis,
        filterReason: analysis.filterReason,
        filterSource: 'auto',
      };
    });

    const filteredNewsCount = rows.filter((item) => item.includedInAnalysis).length;
    const excludedNewsCount = rows.length - filteredNewsCount;

    res.json({
      startDate,
      endDate,
      regions: selections.map((item) => ({
        name: item.name,
        level: item.level,
        label: item.label,
      })),
      rawNewsCount: rows.length,
      filteredNewsCount,
      excludedNewsCount,
      rows,
    });
  } catch (error) {
    console.error('获取地区政策报告新闻失败:', error);
    res.status(500).json({ error: '获取地区政策报告新闻失败', details: error.message });
  }
});

app.post('/api/policy/region-report/generate', async (req, res) => {
  try {
    const { startDate, endDate, regions, promptId, userPrompt, manualOverrides = {} } = req.body || {};
    const selections = normalizeRegionSelections(regions);

    if (!startDate || !endDate) {
      return res.status(400).json({ error: '请选择完整日期区间' });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: '开始日期不能晚于结束日期' });
    }

    if (selections.length === 0) {
      return res.status(400).json({ error: '请至少选择一个地区' });
    }

    const rawRows = await fetchRegionPolicyRows({ startDate, endDate, selections });
    const rows = rawRows
      .map((row) => {
        const analysis = analyzeRegionPolicyNews(row);
        return {
          ...row,
          includedInAnalysis: analysis.includedInAnalysis,
          filterReason: analysis.filterReason,
          filterSource: 'auto',
        };
      })
      .map((row) => applyRegionPolicyManualOverride(row, manualOverrides));

    const filteredRows = rows.filter((item) => item.includedInAnalysis);
    const rawNewsCount = rows.length;
    const filteredNewsCount = filteredRows.length;
    const excludedNewsCount = rawNewsCount - filteredNewsCount;

    if (filteredRows.length === 0) {
      return res.status(400).json({ error: '当前筛选范围无可分析政策新闻' });
    }

    const promptConfig = loadRegionPolicyPromptConfig();
    const prompts = Array.isArray(promptConfig.prompts) ? promptConfig.prompts : [];
    const promptById = promptId ? prompts.find((item) => item.id === promptId) : null;
    const recommendedId = selections.length === 1 ? 'single-region-default' : 'multi-region-default';
    const selectedPrompt =
      promptById ||
      prompts.find((item) => item.id === recommendedId) ||
      prompts.find((item) => item.isDefault) ||
      prompts[0];

    if (!selectedPrompt) {
      return res.status(500).json({ error: '地区政策报告 Prompt 配置不存在' });
    }

    const analysisMode = selections.length === 1 ? 'single-region-timeline' : 'multi-region-comparison';
    const userPromptTemplate = selections.length === 1
      ? selectedPrompt.userPromptSingle
      : selectedPrompt.userPromptMulti;

    const regionBlocks = selections.map((selection) => {
      const selectionNews = filteredRows
        .filter((row) =>
          (row.matchedSelections || []).some(
            (item) => item.name === selection.name && item.level === selection.level
          )
        )
        .sort((a, b) => new Date(a.fetchdate || 0) - new Date(b.fetchdate || 0));

      return buildRegionBlock(selection, selectionNews);
    }).join('\n\n');

    const finalUserPrompt = fillPromptTemplate(userPromptTemplate, {
      analysisMode,
      startDate,
      endDate,
      regions: selections.map((item) => item.label).join('、'),
      rawNewsCount: String(rawNewsCount),
      filteredNewsCount: String(filteredNewsCount),
      excludedNewsCount: String(excludedNewsCount),
      usertopic: String(userPrompt || '无特别要求'),
      regionBlocks,
    });

    const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: REGION_POLICY_REPORT_MODEL,
        messages: [
          { role: 'system', content: selectedPrompt.systemPrompt },
          { role: 'user', content: finalUserPrompt },
        ],
        temperature: 0.35,
        stream: false,
      }),
    });

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text().catch(() => '');
      if (isContextLengthErrorText(errorText)) {
        return res.status(400).json({
          error: '输入内容超出模型上下文限制',
          details: '当前选择的地区、时间范围或纳入分析的新闻过多，导致模型无法完成生成。请缩短日期区间、减少地区数量，或适当取消部分纳入新闻后重试。',
        });
      }
      throw new Error(`DeepSeek API error: ${deepseekResponse.status} ${deepseekResponse.statusText} ${errorText}`.trim());
    }

    const data = await deepseekResponse.json();
    if (data?.error && isContextLengthErrorText(data.error.message || data.error.code || '')) {
      return res.status(400).json({
        error: '输入内容超出模型上下文限制',
        details: '当前选择的地区、时间范围或纳入分析的新闻过多，导致模型无法完成生成。请缩短日期区间、减少地区数量，或适当取消部分纳入新闻后重试。',
      });
    }
    const reportContent = data.choices?.[0]?.message?.content?.trim();

    if (!reportContent) {
      throw new Error('DeepSeek 未返回有效报告内容');
    }

    res.json({
      reportContent,
      debug: {
        systemPrompt: selectedPrompt.systemPrompt,
        userPrompt: finalUserPrompt,
      },
      meta: {
        startDate,
        endDate,
        regions: selections.map((item) => item.label),
        regionCount: selections.length,
        rawNewsCount,
        filteredNewsCount,
        excludedNewsCount,
        promptVersion: selectedPrompt.name,
        promptId: selectedPrompt.id,
        modelName: REGION_POLICY_REPORT_MODEL,
      },
    });
  } catch (error) {
    console.error('生成地区政策报告失败:', error);
    res.status(500).json({
      error: '生成地区政策报告失败',
      details: error.message,
    });
  }
});

app.post('/api/policy/region-report/export-pdf', async (req, res) => {
  const {
    title,
    startDate,
    endDate,
    regions,
    promptVersionName,
    modelName,
    rawNewsCount,
    filteredNewsCount,
    excludedNewsCount,
    reportContent,
    newsReferences,
  } = req.body || {};

  if (!title || !startDate || !endDate || !reportContent) {
    return res.status(400).json({ error: '缺少地区政策报告导出 PDF 所需参数' });
  }

  try {
    const pdfBuffer = await renderRegionPolicyReportPdf({
      title,
      startDate,
      endDate,
      regions,
      promptVersionName,
      modelName,
      rawNewsCount,
      filteredNewsCount,
      excludedNewsCount,
      reportContent,
      newsReferences,
    });

    const filename = buildRegionPolicyReportPdfFilename({
      title,
      startDate,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Content-Disposition', buildAttachmentDisposition(filename));
    res.send(pdfBuffer);
  } catch (error) {
    console.error('地区政策报告 PDF 导出失败:', error);

    if (error instanceof PdfRendererUnavailableError || error?.code === 'PDF_RENDERER_UNAVAILABLE') {
      return res.status(503).json({
        error: 'PDF 引擎不可用',
        details: error.message,
      });
    }

    return res.status(500).json({
      error: '地区政策报告 PDF 生成失败',
      details: error.message,
    });
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
