import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import ErrorBoundary from '../components/ErrorBoundary';
import html2canvas from 'html2canvas';
import ReportImageTemplate from '../components/ReportImageTemplate';
import { KEYWORDS } from '../config/keywords';
// import PromptModal from '../components/PromptModal';
import './ReportGenerator.css';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, WidthType, Table, TableRow, TableCell, ImageRun, ExternalHyperlink, PageBreak } from 'docx';

const ReportGenerator = () => {
  // 可选择的关键词列表（集中配置）
  const availableKeywords = KEYWORDS;
  const [selectedKeyword, setSelectedKeyword] = useState('江苏省国资委'); // 默认选择江苏省国资委
  
  // 获取模型简称
  const getModelShortName = (modelName) => {
    if (!modelName) return 'DeepSeek R1';
    if (modelName.includes('deepseek')) return 'DeepSeek R1';
    if (modelName.includes('KIMI') || modelName.includes('kimi')) return 'KIMI K2';
    if (modelName.includes('gpt')) return 'GPT-4';
    if (modelName.includes('claude')) return 'Claude 3';
    return modelName;
  };
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [newsList, setNewsList] = useState([]);
  const [selectedNews, setSelectedNews] = useState([]);
  const [userPrompt, setUserPrompt] = useState('');
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generatedReport, setGeneratedReport] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [showLowScoreNews, setShowLowScoreNews] = useState(false); // 新增：是否显示低分新闻
  const [scoreFilter, setScoreFilter] = useState('min4');
  const [summaryVersion, setSummaryVersion] = useState('short');
  const [promptOptions, setPromptOptions] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  
  // 二轮修改相关状态
  const [showModifyInput, setShowModifyInput] = useState(false);
  const [modifyRequest, setModifyRequest] = useState('');
  const [isModifying, setIsModifying] = useState(false);
  const [originalReport, setOriginalReport] = useState(''); // 保存原始报告用于修改
  
  // 图片生成相关状态
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState(null);
  
  // 流式输出相关状态
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingStatus, setStreamingStatus] = useState('');
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showModelMessage, setShowModelMessage] = useState(false);
  const [lastSseError, setLastSseError] = useState('');
  const [lastRawSseLine, setLastRawSseLine] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [lastRequestParams, setLastRequestParams] = useState(null);
  const [isGeneratingKimiReport, setIsGeneratingKimiReport] = useState(false);
  const [currentModel, setCurrentModel] = useState('DeepSeek R1'); // 当前使用的模型
  const eventSourceRef = useRef(null);

  // 测试用的模拟周报内容
  const mockReportContent = `# 江苏省国资委相关新闻周报

## 一、本周要闻概述

本周江苏省国资委相关新闻共收集到 **15条** 重要资讯，主要集中在以下几个方面：

### 重点关注领域
- **国企改革深化**：省属国企混改项目取得新进展
- **投资布局优化**：重大基础设施项目加速推进  
- **创新驱动发展**：科技型国企研发投入持续增长
- **风险防控管理**：金融风险防范机制进一步完善

## 二、政策动态分析

### 1. 国企改革新举措
江苏省国资委本周发布了《关于进一步深化省属国有企业改革的实施意见》，明确了未来三年的改革路线图：

- **混合所有制改革**：计划在2025年底前完成50%以上省属国企的混改工作
- **市场化经营机制**：推行职业经理人制度，建立市场化薪酬体系
- **数字化转型**：加大科技创新投入，提升国企核心竞争力

### 2. 投资项目新进展
**重大基础设施建设**方面，本周有多个项目取得突破性进展：

1. **南京都市圈轨道交通项目**：总投资超过800亿元，预计2026年建成通车
2. **苏州工业园区智能制造基地**：引入外资150亿元，打造长三角制造业新高地
3. **连云港港口扩建工程**：新增集装箱吞吐能力200万标箱

## 三、市场表现评估

### 财务指标表现
根据本周公布的数据，江苏省属国企整体运营情况良好：

- **营业收入**：同比增长8.5%，达到新高
- **净利润**：同比增长12.3%，盈利能力持续提升
- **资产负债率**：控制在65%以下，风险可控
- **研发投入**：占营收比重提升至4.2%

### 重点企业动态
**江苏国信集团**：清洁能源板块表现突出，风电装机容量突破500万千瓦
**江苏交控集团**：智慧交通建设加速，ETC覆盖率达到98%
**苏州国发集团**：产业投资基金规模扩大至300亿元

## 四、风险提示与建议

### 主要风险点
1. **宏观经济波动**：全球经济不确定性可能影响国企业绩
2. **行业竞争加剧**：新兴产业领域竞争日趋激烈
3. **资金成本上升**：利率变化对重资产企业影响较大

### 应对建议
- **加强风险管控**：建立完善的风险预警机制
- **优化资产结构**：聚焦主业，剥离非核心资产
- **提升创新能力**：加大研发投入，培育新的增长点

## 五、下周关注重点

1. **省国资委工作会议**：将公布下半年工作重点
2. **重大项目招标**：多个基础设施项目即将启动
3. **企业业绩发布**：几家重点国企将发布半年报

---

*本报告基于公开信息整理分析，仅供参考。如需更详细信息，请查阅相关官方文件。*`;

  // 初始化默认日期：开始日期为上一个周日，结束日期为昨天
  useEffect(() => {
    const today = new Date();
    
    // 获取昨天
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    // 获取上一个周日
    const lastSunday = new Date(today);
    const currentDayOfWeek = today.getDay(); // 0=周日, 1=周一, ..., 6=周六
    
    if (currentDayOfWeek === 0) {
      // 如果今天是周日，上一个周日是7天前
      lastSunday.setDate(today.getDate() - 7);
    } else {
      // 如果今天不是周日，上一个周日是 currentDayOfWeek 天前
      lastSunday.setDate(today.getDate() - currentDayOfWeek);
    }
    
    setStartDate(lastSunday.toISOString().split('T')[0]);
    setEndDate(yesterday.toISOString().split('T')[0]);
  }, []);

  // 自动加载新闻（当日期或关键词准备好时）
  useEffect(() => {
    if (startDate && endDate && selectedKeyword) {
      handleSearchNews();
    }
  }, [startDate, endDate, selectedKeyword]); // 当日期或关键词发生变化时自动搜索

  useEffect(() => {
    const loadPrompts = async () => {
      try {
        const res = await fetch(`/api/keyword-prompts?keyword=${encodeURIComponent(selectedKeyword)}`);
        if (res.ok) {
          const list = await res.json();
          setPromptOptions(list);
          const def = list.find(p => p.isDefault) || list.find(p => p.id === 'default');
          setSelectedPromptId(def ? def.id : (list[0]?.id || ''));
        } else {
          setPromptOptions([]);
          setSelectedPromptId('');
        }
      } catch {
        setPromptOptions([]);
        setSelectedPromptId('');
      }
    };
    if (selectedKeyword) loadPrompts();
  }, [selectedKeyword]);

  // 查询新闻
  const handleSearchNews = async () => {
    if (!startDate || !endDate) {
      alert('请选择日期范围');
      return;
    }

    setIsLoadingNews(true);
    try {
      let apiUrl;
      if (scoreFilter === 'all') {
        apiUrl = `/api/weekly-news?keyword=${selectedKeyword}&startDate=${startDate}&endDate=${endDate}&includeAll=true`;
      } else if (scoreFilter === 'min4') {
        apiUrl = `/api/weekly-news?keyword=${selectedKeyword}&startDate=${startDate}&endDate=${endDate}&minScore=4`;
      } else {
        apiUrl = `/api/weekly-news?keyword=${selectedKeyword}&startDate=${startDate}&endDate=${endDate}&minScore=3`;
      }
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      setNewsList(data);
      setSelectedNews([]); // 清空之前的选择
      setShowReport(false); // 隐藏之前的报告
    } catch (error) {
      console.error('获取新闻失败:', error);
      alert('获取新闻失败，请稍后重试');
    } finally {
      setIsLoadingNews(false);
    }
  };

  // 处理新闻选择
  const handleNewsSelect = (news, isSelected) => {
    if (isSelected) {
      setSelectedNews([...selectedNews, news]);
    } else {
      setSelectedNews(selectedNews.filter(item => item.id !== news.id));
    }
  };

  // 全选/取消全选
  const handleSelectAll = (isSelectAll) => {
    if (isSelectAll) {
      setSelectedNews([...newsList]);
    } else {
      setSelectedNews([]);
    }
  };

  // 处理分数筛选切换
  const handleScoreFilterChange = (showLowScore) => {
    setShowLowScoreNews(showLowScore);
    // 重新搜索新闻
    if (startDate && endDate) {
      setTimeout(() => {
        handleSearchNews();
      }, 100);
    }
  };

  // 流式修改报告
  const handleModifyReport = async () => {
    if (!modifyRequest.trim()) {
      alert('请输入修改要求');
      return;
    }

    const modifyParams = {
      originalReport,
      modifyRequest: modifyRequest.trim(),
      keyword: selectedKeyword,
      startDate,
      endDate,
      stream: true
    };

    setIsModifying(true);
    setGeneratedReport('');
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingStatus('🔧 准备开始修改周报...');
    
    try {
      const response = await fetch('/api/modify-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...modifyParams, promptId: selectedPromptId, summaryVersion })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              
              switch (parsed.type) {
                case 'debug':
                  setDebugInfo(parsed.data);
                  break;
                case 'status':
                  setStreamingStatus(parsed.message);
                  break;
                case 'reasoning':
                  setStreamingReasoning(prev => prev + parsed.content);
                  break;
                case 'content':
                  setStreamingContent(prev => prev + parsed.content);
                  setGeneratedReport(prev => prev + parsed.content);
                  break;
                case 'done':
                  setGeneratedReport(parsed.report);
                  setStreamingStatus('✅ 周报修改完成！');
                  setShowModifyInput(false);
                  setModifyRequest('');
                  return;
                case 'error':
                  setStreamingStatus(`❌ 修改失败: ${parsed.message}`);
                  setLastSseError(parsed.message || '未知错误');
                  return;
              }
            } catch (e) {
              console.warn('解析SSE数据失败:', e, data);
            }
          }
        }
      }
    } catch (error) {
      console.error('修改周报失败:', error);
      setStreamingStatus(`❌ 修改失败: ${error.message}`);
    } finally {
      setIsModifying(false);
    }
  };

  // 根据关键词生成标题
  const getReportTitle = (keyword) => {
    if (keyword === '江苏省国资委') {
      return '省属国企新闻周报';
    }
    return `${keyword}新闻周报`;
  };

  // 创建与PDF一致的HTML结构
  const createPDFStyleHTML = () => {
    // 格式化日期函数
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${month}/${day}`;
    };

    // 解析Markdown为HTML
    const parseMarkdownToHTML = (markdownContent) => {
      const lines = markdownContent.split('\n');
      let html = '';
      let lastH1Title = '';
      let lastH2Title = '';
      let lastH3Title = '';
      let lastH4Title = '';
      let inList = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 处理标题 - 支持多个#号
        if (line.match(/^#+\s/)) {
          // 如果之前在列表中，先关闭列表
          if (inList) {
            html += '</ul>';
            inList = false;
          }
          
          const hashCount = line.match(/^#+/)[0].length;
          const titleText = line.replace(/^#+\s*/, '').trim(); // 移除所有#号和空格
          
          if (hashCount === 1) {
            // 一级标题
            if (titleText !== lastH1Title) {
              html += `<h1 style="font-size: 64px; margin: 40px 0 24px 0; color: #1a2240; font-weight: 700; text-align: left; letter-spacing: 0.3px; border-bottom: 2px solid #3d8bfd; padding-bottom: 12px; font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif; line-height: 1.3;">${titleText}</h1>`;
              lastH1Title = titleText;
            }
          } else if (hashCount === 2) {
            // 二级标题
            if (titleText !== lastH2Title) {
              html += `<h2 style="font-size: 56px; margin: 32px 0 20px 0; color: #2c3e50; font-weight: 600; text-align: left; letter-spacing: 0.2px; font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif; line-height: 1.4;">${titleText}</h2>`;
              lastH2Title = titleText;
            }
          } else if (hashCount === 3) {
            // 三级标题
            if (titleText !== lastH3Title) {
              html += `<h3 style="font-size: 48px; margin: 28px 0 16px 0; color: #34495e; font-weight: 600; text-align: left; font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif; line-height: 1.4;">${titleText}</h3>`;
              lastH3Title = titleText;
            }
          } else {
            // 四级及以上标题（包括7个#号的情况）- 作为小标题处理
            if (titleText !== lastH4Title) {
              html += `<h4 style="font-size: 40px; margin: 24px 0 12px 0; color: #495057; font-weight: 600; text-align: left; font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif; line-height: 1.4;">${titleText}</h4>`;
              lastH4Title = titleText;
            }
          }
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          // 如果不在列表中，开始一个新列表
          if (!inList) {
            html += '<ul style="margin: 16px 0; padding-left: 20px; list-style-type: disc;">';
            inList = true;
          }
          
          // 处理列表项中的粗体文本
          let processedLine = line.substring(2);
          processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #1a2240; font-weight: 700; font-family: inherit;">$1</strong>');
          // 处理单个星号的加粗
          processedLine = processedLine.replace(/\*([^*]+)\*/g, '<strong style="color: #1a2240; font-weight: 700; font-family: inherit;">$1</strong>');
          html += `<li style="margin: 8px 0; text-align: left; line-height: 1.6; font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif; font-size: 36px; color: #333;">${processedLine}</li>`;
        } else if (line.length > 0) {
          // 如果之前在列表中，先关闭列表
          if (inList) {
            html += '</ul>';
            inList = false;
          }
          
          // 处理内联粗体文本
          let processedLine = line;
          processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #1a2240; font-weight: 700; font-family: inherit;">$1</strong>');
          // 处理单个星号的加粗
          processedLine = processedLine.replace(/\*([^*]+)\*/g, '<strong style="color: #1a2240; font-weight: 700; font-family: inherit;">$1</strong>');
          html += `<p style="margin: 16px 0; text-align: left; line-height: 1.6; color: #333; font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif; font-size: 36px; text-align: justify; text-indent: 2em;">${processedLine}</p>`;
        } else {
          // 如果之前在列表中，先关闭列表
          if (inList) {
            html += '</ul>';
            inList = false;
          }
          html += '<div style="height: 16px;"></div>';
        }
      }
      
      // 如果最后还在列表中，关闭列表
      if (inList) {
        html += '</ul>';
      }
      
      return html;
    };

    return `
      <div style="
        font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
        background: #ffffff;
        width: 1080px;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        display: block;
        visibility: visible;
        position: relative;
        overflow: hidden;
        line-height: 1.6;
      ">
        <!-- 头部区块 -->
        <div style="
          background: linear-gradient(90deg, #232526 0%, #3d8bfd 100%);
          padding: 48px 0 24px 0;
          text-align: center;
          position: relative;
          display: block;
        ">
          <!-- 主标题 -->
          <h1 style="
            font-size: 108px;
            font-weight: 900;
            letter-spacing: 1px;
            color: #fff;
            margin: 64px 0 12px 0;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
            display: block;
          ">${getReportTitle(selectedKeyword)}</h1>
          
          <!-- 副标题 -->
          <div style="
            margin: 0 0 18px 0;
          ">
            <span style="
              font-size: 32px;
              color: #ffffff;
              letter-spacing: 0.5px;
              font-weight: 400;
            ">🤖 AI新闻总结</span>
          </div>
          
          <!-- 信息行 -->
          <div style="
            background: rgba(255,255,255,0.95);
            margin: 0 auto;
            max-width: 900px;
            border-radius: 8px;
            padding: 12px 20px;
            font-size: 22px;
            color: #3d8bfd;
            font-weight: 500;
            letter-spacing: 0.3px;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
          ">
            <span>时间：${formatDate(startDate)} - ${formatDate(endDate)}</span>
            <span style="color: #b3c6ff;">|</span>
            <span>AI挑选新闻：${selectedNews.length} 条</span>
            <span style="color: #b3c6ff;">|</span>
            <span>大模型：${getModelShortName(debugInfo?.model)}</span>
          </div>
        </div>
        
        <!-- 正文区块 -->
        <div style="
          background: #fff;
          padding: 24px 60px 32px 60px;
          margin: 0;
          display: block;
        ">
          ${parseMarkdownToHTML(generatedReport)}
        </div>
      </div>
    `;
  };

  // 生成图片
  const handleGenerateImage = async () => {
    console.log('=== 开始生成图片 ===');
    console.log('generatedReport存在:', !!generatedReport);
    console.log('generatedReport长度:', generatedReport?.length);
    console.log('debugInfo:', debugInfo);
    console.log('selectedKeyword:', selectedKeyword);
    console.log('startDate:', startDate);
    console.log('endDate:', endDate);
    console.log('selectedNews长度:', selectedNews?.length);
    
    if (!generatedReport) {
      alert('请先生成周报');
      return;
    }

    setIsGeneratingImage(true);
    
    try {
      // 创建临时的图片模板元素
      const tempElement = document.createElement('div');
      tempElement.style.position = 'absolute';
      tempElement.style.left = '-9999px';
      tempElement.style.top = '0';
      tempElement.style.width = '1080px';
      tempElement.style.height = 'auto';
      tempElement.style.zIndex = '-1';
      tempElement.style.visibility = 'visible'; // 改为visible确保渲染
      tempElement.style.background = '#f6f8fa';
      
      // 设置HTML内容
      const htmlContent = createPDFStyleHTML();
      console.log('生成的HTML内容长度:', htmlContent.length);
      console.log('HTML内容预览:', htmlContent.substring(0, 300));
      
      tempElement.innerHTML = htmlContent;
      
      // 添加到DOM中
      document.body.appendChild(tempElement);
      
      // 等待渲染完成，确保元素完全加载
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 检查元素是否存在
      if (!tempElement.firstChild) {
        throw new Error('无法找到要转换的元素');
      }

      // 调试：检查元素内容
      console.log('临时元素内容:', tempElement.innerHTML.substring(0, 200));
      
      // 确保元素完全渲染
      console.log('tempElement高度:', tempElement.scrollHeight);
      console.log('tempElement可见性:', tempElement.style.visibility);
      
      // 强制重新计算布局
      tempElement.offsetHeight;
      
      // 再次等待确保布局完成
      await new Promise(resolve => setTimeout(resolve, 500));

      // 计算实际内容高度
      const contentHeight = tempElement.scrollHeight;
      console.log('实际内容高度:', contentHeight);
      
      // 生成图片 - 直接使用tempElement
      const canvas = await html2canvas(tempElement, {
        useCORS: true,
        allowTaint: false,
        scale: 2, // 降低到2倍缩放，在清晰度和文件大小间取平衡
        width: 1080,
        height: contentHeight, // 使用实际内容高度
        backgroundColor: '#ffffff',
        logging: true, // 开启日志以便调试
        onclone: (clonedDoc) => {
          // 安全复制可访问的同源内联样式，避免跨域样式读取导致的SecurityError
          const styleSheets = Array.from(document.styleSheets);
          styleSheets.forEach(sheet => {
            try {
              const href = sheet.href;
              const sameOrigin = !href || new URL(href, document.baseURI).origin === location.origin;
              if (!sameOrigin) return;
              const rules = sheet.cssRules;
              if (!rules) return;
              const styleEl = clonedDoc.createElement('style');
              let cssText = '';
              for (let i = 0; i < rules.length; i++) {
                cssText += rules[i].cssText + '\n';
              }
              styleEl.textContent = cssText;
              clonedDoc.head.appendChild(styleEl);
            } catch (e) {
              // 跳过不可访问的样式表
            }
          });
          
          // 确保克隆的元素可见并且高度正确
          const clonedElement = clonedDoc.querySelector('div');
          if (clonedElement) {
            clonedElement.style.visibility = 'visible';
            clonedElement.style.display = 'block';
            clonedElement.style.position = 'relative';
            clonedElement.style.left = '0';
            clonedElement.style.top = '0';
            // 确保内容完全显示
            clonedElement.style.overflow = 'visible';
            clonedElement.style.height = 'auto';
            
            // 确保所有子元素也是可见的，并处理特定元素类型
            Array.from(clonedElement.querySelectorAll('*')).forEach(el => {
              el.style.visibility = 'visible';
              
              // 确保所有文本元素正确显示
              if (el.tagName === 'DIV') {
                el.style.overflow = 'visible';
                el.style.height = 'auto';
              }
              
              // 确保标题元素正确显示
              if (['H1', 'H2', 'H3', 'H4'].includes(el.tagName)) {
                el.style.display = 'block';
                el.style.visibility = 'visible';
                // 移除可能的额外 # 符号
                el.textContent = el.textContent.replace(/^#+\s*/, '');
              }
              
              // 确保强调文本正确显示
              if (el.tagName === 'STRONG') {
                el.style.fontWeight = '700';
                el.style.color = '#1a2240';
              }
              
              // 确保列表项正确显示
              if (el.tagName === 'LI') {
                el.style.display = 'list-item';
                el.style.visibility = 'visible';
              }
              
              // 确保列表容器正确显示
              if (el.tagName === 'UL') {
                el.style.display = 'block';
                el.style.visibility = 'visible';
                el.style.margin = '16px 0';
                el.style.paddingLeft = '20px';
                el.style.listStyleType = 'disc';
              }
            });
          }
        }
      });

      // 转换为下载链接
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        setGeneratedImageUrl(url);
        
        // 自动下载
        const link = document.createElement('a');
        link.href = url;
        const modelShortName = getModelShortName(debugInfo?.model);
        link.download = `AI新闻周报_${selectedKeyword}_${modelShortName}_${new Date().toISOString().split('T')[0]}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert('图片已生成并下载！');
      }, 'image/jpeg', 0.85); // 使用JPEG格式，质量85%，大幅减小文件大小

      // 清理临时元素
      document.body.removeChild(tempElement);
      
    } catch (error) {
      console.error('生成图片失败:', error);
      alert('生成图片失败，请稍后重试');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateImageWithContact = async () => {
    if (!generatedReport) {
      alert('请先生成周报');
      return;
    }
    setIsGeneratingImage(true);
    try {
      const tempElement = document.createElement('div');
      tempElement.style.position = 'absolute';
      tempElement.style.left = '-9999px';
      tempElement.style.top = '0';
      tempElement.style.width = '1080px';
      tempElement.style.height = 'auto';
      tempElement.style.zIndex = '-1';
      tempElement.style.visibility = 'visible';
      tempElement.style.background = '#f6f8fa';
      const htmlContent = createPDFStyleHTML();
      tempElement.innerHTML = htmlContent;
      document.body.appendChild(tempElement);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const footer = document.createElement('div');
      footer.textContent = '定制关键词联系人:顾芷西，13305150560';
      footer.style.fontFamily = "'PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif";
      footer.style.fontSize = '30px';
      footer.style.color = '#3d4673';
      footer.style.textAlign = 'center';
      footer.style.padding = '16px 0';
      footer.style.margin = '28px 0 0 0';
      footer.style.background = 'linear-gradient(90deg, #f8faff 0%, #eaf3ff 100%)';
      footer.style.borderTop = '1px solid #dbeafe';
      footer.style.boxShadow = '0 -2px 8px rgba(61,139,253,0.08)';
      let root = tempElement.querySelector('div');
      if (!root || root.nodeType !== 1) {
        root = tempElement;
      }
      root.appendChild(footer);
      await new Promise(resolve => setTimeout(resolve, 300));
      const contentHeight = tempElement.scrollHeight;
      const canvas = await html2canvas(tempElement, {
        useCORS: true,
        allowTaint: false,
        scale: 2,
        width: 1080,
        height: contentHeight,
        backgroundColor: '#ffffff',
        logging: false
      });
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        setGeneratedImageUrl(url);
        const link = document.createElement('a');
        link.href = url;
        const modelShortName = getModelShortName(debugInfo?.model);
        link.download = `AI新闻周报_${selectedKeyword}_${modelShortName}_${new Date().toISOString().split('T')[0]}_含联系方式.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert('图片已生成并下载！');
      }, 'image/jpeg', 0.85);
      document.body.removeChild(tempElement);
    } catch (error) {
      console.error('生成图片失败:', error);
      alert('生成图片失败，请稍后重试');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 流式生成周报
  const handleGenerateReport = async () => {
    if (selectedNews.length === 0) {
      alert('请至少选择一条新闻');
      return;
    }

    const requestParams = {
      keyword: selectedKeyword,
      startDate,
      endDate,
      selectedNews,
      userPrompt,
      stream: true,
      promptId: selectedPromptId,
      summaryVersion
    };

    setLastRequestParams(requestParams); // 保存请求参数以便重试
    setCanRetry(false);
    setIsGeneratingReport(true);
    setShowReport(true);
    setGeneratedReport('');
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingStatus('🚀 准备开始生成周报...');
    setCurrentModel('DeepSeek R1');

    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 保留不完整的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              
              switch (parsed.type) {
                case 'debug':
                  setDebugInfo(parsed.data);
                  setShowModelMessage(true);
                  break;
                case 'status':
                  setStreamingStatus(parsed.message);
                  break;
                case 'reasoning':
                  setStreamingReasoning(prev => prev + parsed.content);
                  break;
                case 'content':
                  setStreamingContent(prev => prev + parsed.content);
                  setGeneratedReport(prev => prev + parsed.content);
                  break;
                case 'done':
                  setGeneratedReport(parsed.report);
                  setOriginalReport(parsed.report);
                  setStreamingStatus('✅ 周报生成完成！');
                  setCanRetry(false);
                  setShowModifyInput(false);
                  return;
                case 'error':
                  setStreamingStatus(`❌ 生成失败: ${parsed.message}`);
                  setLastSseError(parsed.message || '未知错误');
                  return;
              }
            } catch (e) {
              console.warn('解析SSE数据失败:', e, data);
            }
          }
        }
      }
    } catch (error) {
      console.error('生成周报失败:', error);
      setStreamingStatus(`❌ 生成失败: ${error.message}`);
      setCanRetry(true);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // 重试生成周报
  const handleRetryGenerate = () => {
    if (lastRequestParams) {
      handleGenerateReportWithParams(lastRequestParams);
    }
  };

  // 使用指定参数生成周报（用于重试）
  const handleGenerateReportWithParams = async (params) => {
    setCanRetry(false);
    setIsGeneratingReport(true);
    setGeneratedReport('');
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingStatus('🔄 重新开始生成周报...');

    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              
              switch (parsed.type) {
                case 'debug':
                  setDebugInfo(parsed.data);
                  setShowModelMessage(true);
                  break;
                case 'status':
                  setStreamingStatus(parsed.message);
                  break;
                case 'reasoning':
                  setStreamingReasoning(prev => prev + parsed.content);
                  break;
                case 'content':
                  setStreamingContent(prev => prev + parsed.content);
                  setGeneratedReport(prev => prev + parsed.content);
                  break;
                case 'done':
                  setGeneratedReport(parsed.report);
                  setOriginalReport(parsed.report);
                  setStreamingStatus('✅ 周报生成完成！');
                  setCanRetry(false);
                  setShowModifyInput(false);
                  return;
                case 'error':
                  setStreamingStatus(`❌ 重试失败: ${parsed.message}`);
                  setLastSseError(parsed.message || '未知错误');
                  return;
              }
            } catch (e) {
              console.warn('解析SSE数据失败:', e, data);
            }
          }
        }
      }
    } catch (error) {
      console.error('重试生成周报失败:', error);
      setStreamingStatus(`❌ 重试失败: ${error.message}`);
      setCanRetry(true);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // KIMI生成周报
  const handleGenerateKimiReport = async () => {
    if (selectedNews.length === 0) {
      alert('请至少选择一条新闻');
      return;
    }

    const requestParams = {
      keyword: selectedKeyword,
      startDate,
      endDate,
      selectedNews,
      userPrompt,
      stream: true,
      promptId: selectedPromptId,
      summaryVersion
    };

    setLastRequestParams(requestParams);
    setCanRetry(false);
    setIsGeneratingKimiReport(true);
    setShowReport(true);
    setGeneratedReport('');
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingStatus('🚀 准备开始生成周报...');
    setCurrentModel('KIMI K2');

    try {
      const response = await fetch('/api/generate-kimi-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              
              switch (parsed.type) {
                case 'debug':
                  setDebugInfo(parsed.data);
                  setShowModelMessage(true);
                  break;
                case 'status':
                  setStreamingStatus(parsed.message);
                  break;
                case 'reasoning':
                  setStreamingReasoning(prev => prev + parsed.content);
                  break;
                case 'content':
                  setStreamingContent(prev => prev + parsed.content);
                  setGeneratedReport(prev => prev + parsed.content);
                  break;
                case 'done':
                  setGeneratedReport(parsed.report);
                  setOriginalReport(parsed.report);
                  setStreamingStatus('✅ 周报生成完成！');
                  setCanRetry(false);
                  setShowModifyInput(false);
                  return;
                case 'error':
                  setStreamingStatus(`❌ 生成失败: ${parsed.message}`);
                  setLastSseError(parsed.message || '未知错误');
                  return;
              }
            } catch (e) {
              console.warn('解析SSE数据失败:', e, data);
            }
          }
        }
      }
    } catch (error) {
      console.error('生成KIMI周报失败:', error);
      setStreamingStatus(`❌ 生成失败: ${error.message}`);
      setCanRetry(true);
    } finally {
      setIsGeneratingKimiReport(false);
    }
  };

  // 格式化日期显示
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // 获取评分对应的颜色和样式
  const getScoreStyle = (score) => {
    const numScore = parseFloat(score);
    if (numScore >= 4) {
      return { backgroundColor: '#28a745', color: 'white', label: '高分' }; // 绿色 - 高分
    } else if (numScore >= 3) {
      return { backgroundColor: '#17a2b8', color: 'white', label: '中等' }; // 青色 - 中等
    } else if (numScore >= 2) {
      return { backgroundColor: '#ffc107', color: '#333', label: '较低' }; // 黄色 - 较低
    } else if (numScore >= 1) {
      return { backgroundColor: '#fd7e14', color: 'white', label: '低分' }; // 橙色 - 低分
    } else {
      return { backgroundColor: '#dc3545', color: 'white', label: '很低' }; // 红色 - 很低
    }
  };

  // 估算token数量 (基于DeepSeek官方标准: 1个中文字符≈0.6token, 1个英文字符≈0.3token)
  const estimateTokens = (text) => {
    if (!text) return 0;
    // 计算中文字符数
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    // 计算英文字符数
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    // 计算其他字符数
    const otherChars = text.length - chineseChars - englishChars;
    
    return Math.ceil(chineseChars * 0.6 + englishChars * 0.3 + otherChars * 0.5);
  };

  // 解析Markdown内容为docx格式
  const parseMarkdownToDocx = (markdownContent) => {
    const lines = markdownContent.split('\n');
    const children = [];
    let lastH1Title = ''; // 用于检测H1重复标题
    let lastH2Title = ''; // 用于检测H2重复标题
    let lastH3Title = ''; // 用于检测H3重复标题
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('# ')) {
        // H1标题 - 检查是否重复
        const titleText = line.substring(2);
        if (titleText !== lastH1Title) {
          children.push(
            new Paragraph({
              text: titleText,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.LEFT,
              spacing: { before: 400, after: 200 },
              children: [
                new TextRun({
                  text: titleText,
                  bold: true,
                  size: 28,
                  color: '1a2240',
                  font: 'Inter'
                })
              ]
            })
          );
          lastH1Title = titleText;
        }
      } else if (line.startsWith('## ')) {
        // H2标题 - 检查是否重复
        const titleText = line.substring(3);
        if (titleText !== lastH2Title) {
          children.push(
            new Paragraph({
              text: titleText,
              heading: HeadingLevel.HEADING_2,
              alignment: AlignmentType.LEFT,
              spacing: { before: 300, after: 150 },
              children: [
                new TextRun({
                  text: titleText,
                  bold: true,
                  size: 24,
                  color: '2c3e50',
                  font: 'Inter'
                })
              ]
            })
          );
          lastH2Title = titleText;
        }
      } else if (line.startsWith('### ')) {
        // H3标题 - 检查是否重复
        const titleText = line.substring(4);
        if (titleText !== lastH3Title) {
          children.push(
            new Paragraph({
              text: titleText,
              heading: HeadingLevel.HEADING_3,
              alignment: AlignmentType.LEFT,
              spacing: { before: 250, after: 120 },
              children: [
                new TextRun({
                  text: titleText,
                  bold: true,
                  size: 20,
                  color: '34495e',
                  font: 'Inter'
                })
              ]
            })
          );
          lastH3Title = titleText;
        }
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        // 列表项
        children.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 60, after: 60 },
            children: [
              new TextRun({
                text: '• ',
                size: 16,
                color: '333333',
                font: 'Inter'
              }),
              new TextRun({
                text: line.substring(2),
                size: 16,
                color: '333333',
                font: 'Inter'
              })
            ]
          })
        );
      } else if (line.length > 0) {
        // 普通段落 - 处理内联粗体文本
        const textRuns = [];
        let currentText = '';
        let inBold = false;
        let j = 0;
        
        while (j < line.length) {
          // 检查是否是粗体标记
          if (j + 1 < line.length && line[j] === '*' && line[j + 1] === '*') {
            if (inBold) {
              // 结束粗体
              if (currentText) {
                textRuns.push(new TextRun({
                  text: currentText,
                  bold: true,
                  size: 16,
                  color: '1a2240',
                  font: 'Inter'
                }));
                currentText = '';
              }
              inBold = false;
            } else {
              // 开始粗体
              if (currentText) {
                textRuns.push(new TextRun({
                  text: currentText,
                  size: 16,
                  color: '333333',
                  font: 'Inter'
                }));
                currentText = '';
              }
              inBold = true;
            }
            j += 2; // 跳过两个星号
          } else {
            currentText += line[j];
            j++;
          }
        }
        
        // 添加剩余文本
        if (currentText) {
          textRuns.push(new TextRun({
            text: currentText,
            size: 16,
            color: inBold ? '1a2240' : '333333',
            bold: inBold,
            font: 'Inter'
          }));
        }
        
        // 如果没有解析出任何文本运行，添加原始文本
        if (textRuns.length === 0) {
          textRuns.push(new TextRun({
            text: line,
            size: 16,
            color: '333333',
            font: 'Inter'
          }));
        }
        
        children.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 120, after: 120 },
            children: textRuns
          })
        );
      } else {
        // 空行
        children.push(
          new Paragraph({
            spacing: { before: 60, after: 60 }
          })
        );
      }
    }
    
    return children;
  };

  const handleGenerateDocx = async () => {
    if (!generatedReport) {
      alert('请先生成周报');
      return;
    }

    try {
      // 格式化日期函数
      const formatDate = (dateString) => {
        const date = new Date(dateString);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}/${day}`;
      };

      // 获取模型简称
      const getModelShortName = (modelName) => {
        if (!modelName) return 'DeepSeek R1';
        if (modelName.includes('deepseek')) return 'DeepSeek R1';
        if (modelName.includes('KIMI') || modelName.includes('kimi')) return 'KIMI K2';
        if (modelName.includes('gpt')) return 'GPT-4';
        if (modelName.includes('claude')) return 'Claude 3';
        return modelName;
      };

      // 创建文档
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch
                right: 1440,
                bottom: 1440,
                left: 1440
              }
            }
          },
          children: [
            // 带背景的头部区域
            new Table({
              width: {
                size: 100,
                type: WidthType.PERCENTAGE,
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        // 主标题
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          spacing: { before: 400, after: 200 },
                          children: [
                            new TextRun({
                              text: getReportTitle(selectedKeyword),
                              bold: true,
                              size: 34,
                              color: 'ffffff',
                              font: 'Inter'
                            })
                          ]
                        }),
                        
                        // 副标题
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          spacing: { before: 0, after: 300 },
                          children: [
                            new TextRun({
                              text: '🤖 AI智能新闻周报',
                              size: 15,
                              color: 'ffffff',
                              font: 'Inter'
                            })
                          ]
                        }),

                        // 信息表格
                        new Table({
                          width: {
                            size: 100,
                            type: WidthType.PERCENTAGE,
                          },
                          rows: [
                            new TableRow({
                              children: [
                                new TableCell({
                                  children: [
                                    new Paragraph({
                                      alignment: AlignmentType.CENTER,
                                      children: [
                                        new TextRun({
                                          text: `时间：${formatDate(startDate)} - ${formatDate(endDate)}`,
                                          size: 12,
                                          color: '3d8bfd',
                                          font: 'Inter'
                                        })
                                      ]
                                    })
                                  ],
                                  width: {
                                    size: 33.33,
                                    type: WidthType.PERCENTAGE,
                                  }
                                }),
                                new TableCell({
                                  children: [
                                    new Paragraph({
                                      alignment: AlignmentType.CENTER,
                                      children: [
                                        new TextRun({
                                          text: `AI评分价值新闻：${selectedNews.length} 条`,
                                          size: 12,
                                          color: '3d8bfd',
                                          font: 'Inter'
                                        })
                                      ]
                                    })
                                  ],
                                  width: {
                                    size: 33.33,
                                    type: WidthType.PERCENTAGE,
                                  }
                                }),
                                new TableCell({
                                  children: [
                                    new Paragraph({
                                      alignment: AlignmentType.CENTER,
                                      children: [
                                        new TextRun({
                                          text: `大模型：${getModelShortName(debugInfo?.model)}`,
                                          size: 12,
                                          color: '3d8bfd',
                                          font: 'Inter'
                                        })
                                      ]
                                    })
                                  ],
                                  width: {
                                    size: 33.33,
                                    type: WidthType.PERCENTAGE,
                                  }
                                })
                              ]
                            })
                          ]
                        })
                      ],
                      width: {
                        size: 100,
                        type: WidthType.PERCENTAGE,
                      },
                      shading: {
                        fill: '3d8bfd',
                        color: '3d8bfd'
                      }
                    })
                  ]
                })
              ]
            }),

            // 空行
            new Paragraph({
              spacing: { before: 400, after: 0 }
            }),

            // 解析Markdown内容
            ...parseMarkdownToDocx(generatedReport)
          ]
        }]
      });

      // 生成并下载文档
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const modelShortName = getModelShortName(debugInfo?.model);
      link.download = `AI新闻周报_${selectedKeyword}_${modelShortName}_${new Date().toISOString().split('T')[0]}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert('Word文档已生成并下载！');
    } catch (error) {
      console.error('生成Word文档失败:', error);
      alert('生成Word文档失败，请稍后重试');
    }
  };

  const handleGeneratePDF = async () => {
    if (!generatedReport) {
      alert('请先生成周报');
      return;
    }
    // 获取渲染后的Markdown内容
    const reportContentElement = document.querySelector('.report-content');
    if (!reportContentElement) {
      alert('未找到周报内容区域');
      return;
    }
    // 构造带AI科技感的PDF结构
    const tempDiv = document.createElement('div');
    tempDiv.style.padding = '0 0 24px 0';
    tempDiv.style.fontFamily = 'Inter, Roboto, Helvetica, Arial, sans-serif';
    tempDiv.style.background = '#f6f8fa';
    tempDiv.style.borderRadius = '18px';
    tempDiv.style.overflow = 'hidden';
    tempDiv.style.position = 'relative';
    // 顶部科技感线条
    const topLine = document.createElement('div');
    topLine.style.height = '6px';
    topLine.style.background = 'linear-gradient(90deg, #3d8bfd 0%, #a259ff 100%)';
    topLine.style.borderRadius = '6px 6px 0 0';
    topLine.style.boxShadow = '0 0 16px 2px #3d8bfd55';
    topLine.style.marginBottom = '0';
    tempDiv.appendChild(topLine);
    // head区块
    const headBlock = document.createElement('div');
    headBlock.style.background = 'linear-gradient(90deg, #232526 0%, #3d8bfd 100%)';
    headBlock.style.borderRadius = '0 0 18px 18px';
    headBlock.style.boxShadow = '0 4px 24px 0 rgba(61,139,253,0.10)';
    headBlock.style.padding = '32px 0 18px 0';
    headBlock.style.textAlign = 'center';
    headBlock.style.position = 'relative';
    headBlock.style.pageBreakInside = 'avoid';
    headBlock.style.breakInside = 'avoid';
    // 主标题
    const title = document.createElement('h1');
    title.textContent = getReportTitle(selectedKeyword);
    title.style.fontSize = '34px';
    title.style.fontWeight = '900';
    title.style.letterSpacing = '2px';
    title.style.color = '#fff';
    title.style.margin = '0 0 8px 0';
    title.style.textShadow = '0 2px 8px #3d8bfd88';
    title.style.fontFamily = 'Inter, Roboto, Helvetica, Arial, sans-serif';
    title.style.display = 'inline-block';
    title.style.verticalAlign = 'middle';
    title.style.pageBreakInside = 'avoid';
    title.style.breakInside = 'avoid';
    headBlock.appendChild(title);
    // 副标题+机器人icon
    const subtitleRow = document.createElement('div');
    subtitleRow.style.display = 'flex';
    subtitleRow.style.justifyContent = 'center';
    subtitleRow.style.alignItems = 'center';
    subtitleRow.style.gap = '6px';
    subtitleRow.style.margin = '4px 0 0 0';
    subtitleRow.style.pageBreakInside = 'avoid';
    subtitleRow.style.breakInside = 'avoid';
    // 机器人icon
    const aiIcon = document.createElement('span');
    aiIcon.textContent = '🤖';
    aiIcon.style.fontSize = '18px';
    aiIcon.style.display = 'inline-block';
    subtitleRow.appendChild(aiIcon);
    // 副标题
    const subtitle = document.createElement('span');
    subtitle.textContent = 'AI智能新闻周报';
    subtitle.style.fontSize = '15px';
    subtitle.style.color = '#e0e7ff';
    subtitle.style.letterSpacing = '1px';
    subtitle.style.fontWeight = '500';
    subtitleRow.appendChild(subtitle);
    headBlock.appendChild(subtitleRow);
    // 时间+统计信息一行
    const infoRow = document.createElement('div');
    infoRow.style.display = 'flex';
    infoRow.style.justifyContent = 'center';
    infoRow.style.alignItems = 'center';
    infoRow.style.gap = '18px';
    infoRow.style.background = 'rgba(255,255,255,0.95)';
    infoRow.style.margin = '18px auto 0 auto';
    infoRow.style.maxWidth = '600px';
    infoRow.style.borderRadius = '12px';
    infoRow.style.boxShadow = '0 2px 8px 0 #3d8bfd11';
    infoRow.style.padding = '6px 24px 4px 24px';
    infoRow.style.fontSize = '12px';
    infoRow.style.color = '#3d8bfd';
    infoRow.style.fontWeight = '500';
    infoRow.style.letterSpacing = '0.5px';
    infoRow.style.pageBreakInside = 'avoid';
    infoRow.style.breakInside = 'avoid';
    // 时间 - 只保留mm/dd格式
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${month}/${day}`;
    };
    const timeSpan = document.createElement('span');
    timeSpan.textContent = `时间：${formatDate(startDate)} - ${formatDate(endDate)}`;
    infoRow.appendChild(timeSpan);
    // 分隔符
    const sep1 = document.createElement('span');
    sep1.textContent = '|';
    sep1.style.color = '#b3c6ff';
    sep1.style.margin = '0 8px';
    infoRow.appendChild(sep1);
    // 新闻数 - 改为"AI评分价值新闻"
    const newsCount = document.createElement('span');
    newsCount.textContent = `AI评分价值新闻：${selectedNews.length} 条`;
    infoRow.appendChild(newsCount);
    // 分隔符
    const sep2 = document.createElement('span');
    sep2.textContent = '|';
    sep2.style.color = '#b3c6ff';
    sep2.style.margin = '0 8px';
    infoRow.appendChild(sep2);
    // AI模型 - 改为"大模型"并使用简称
    const getModelShortName = (modelName) => {
      if (!modelName) return 'DeepSeek R1';
      if (modelName.includes('deepseek')) return 'DeepSeek R1';
      if (modelName.includes('KIMI') || modelName.includes('kimi')) return 'KIMI K2';
      if (modelName.includes('gpt')) return 'GPT-4';
      if (modelName.includes('claude')) return 'Claude 3';
      return modelName;
    };
    const modelName = document.createElement('span');
    modelName.textContent = `大模型：${getModelShortName(debugInfo?.model)}`;
    infoRow.appendChild(modelName);
    headBlock.appendChild(infoRow);
    tempDiv.appendChild(headBlock);
    // 正文区块
    const reportBlock = document.createElement('div');
    reportBlock.style.background = '#fff';
    reportBlock.style.borderRadius = '16px';
    reportBlock.style.padding = '18px 28px 18px 28px';
    reportBlock.style.margin = '0 auto 0 auto';
    reportBlock.style.maxWidth = '820px';
    reportBlock.style.boxShadow = '0 2px 16px 0 #3d8bfd11';
    reportBlock.style.pageBreakInside = 'avoid';
    reportBlock.style.breakInside = 'avoid';
    // 删除“AI生成周报”标题和图标
    // 只保留正文内容
    const contentClone = reportContentElement.cloneNode(true);
    contentClone.style.background = '#fff';
    contentClone.style.borderRadius = '12px';
    contentClone.style.padding = '0';
    contentClone.style.margin = '0';
    contentClone.style.maxWidth = '100%';
    contentClone.style.pageBreakInside = 'avoid';
    contentClone.style.breakInside = 'avoid';
    // 针对正文内所有段落、标题等加分页控制
    const blockTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE'];
    blockTags.forEach(tag => {
      contentClone.querySelectorAll(tag).forEach(el => {
        el.style.pageBreakInside = 'avoid';
        el.style.breakInside = 'avoid';
      });
    });
    reportBlock.appendChild(contentClone);
    tempDiv.appendChild(reportBlock);
    document.body.appendChild(tempDiv);
    // 动态引入 html2pdf.js
    const html2pdf = (await import('html2pdf.js')).default;
    await html2pdf()
      .from(tempDiv)
      .set({
        margin: 0.5,
        filename: `AI新闻周报_${selectedKeyword}_${getModelShortName(debugInfo?.model)}_${new Date().toISOString().split('T')[0]}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      })
      .save();
    // 清理临时div
    document.body.removeChild(tempDiv);
  };

  return (
    <ErrorBoundary>
    <div className="report-generator">
      <div className="page-header" style={{
        background: 'linear-gradient(90deg, #232526 0%, #3d8bfd 100%)',
        borderRadius: '12px',
        padding: '32px 0 24px 0',
        marginBottom: '28px',
        boxShadow: '0 4px 24px 0 rgba(61,139,253,0.10)',
        position: 'relative',
        textAlign: 'center',
        overflow: 'hidden',
      }}>
        <div style={{
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: 2,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          textShadow: '0 2px 8px #3d8bfd88',
        }}>
          <span style={{fontSize: 32, marginRight: 8, filter: 'drop-shadow(0 2px 8px #3d8bfd88)'}}>🧬</span>
          <span style={{fontSize: 36, fontFamily: 'Inter, Roboto, Helvetica, Arial, sans-serif'}}>AI News Report Generator</span>
        </div>
        <div style={{
          height: 4,
          background: 'linear-gradient(90deg, #3d8bfdcc 0%, #5f6cffcc 100%)',
          margin: '18px auto 0 auto',
          maxWidth: 320,
          borderRadius: 4,
          boxShadow: '0 0 12px 2px #3d8bfd44',
          opacity: 0.85
        }}></div>
      </div>

      {/* 筛选区域 */}
      <div className="filter-section">
        <div className="filter-row">
          <div className="filter-item">
            <label>关键词:</label>
            <select 
              value={selectedKeyword} 
              onChange={(e) => setSelectedKeyword(e.target.value)}
              className="keyword-select"
            >
              {availableKeywords.map(keyword => (
                <option key={keyword} value={keyword}>
                  {keyword}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-item">
            <label>开始日期:</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="date-input"
            />
          </div>
          
          <div className="filter-item">
            <label>结束日期:</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="date-input"
            />
          </div>
          
          <button 
            onClick={handleSearchNews} 
            disabled={isLoadingNews}
            className="search-btn"
          >
            {isLoadingNews ? '查询中...' : '查询新闻'}
          </button>
        </div>
        
        <div className="score-filter-section">
          <div className="score-filter-item">
            <label>分数筛选:</label>
            <select value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)} className="score-select">
              <option value="min3">3分以上</option>
              <option value="min4">4分以上</option>
              <option value="all">全部新闻</option>
            </select>
          </div>
          <div className="score-filter-item">
            <label>短总结:</label>
            <input type="checkbox" checked={summaryVersion === 'short'} onChange={(e) => setSummaryVersion(e.target.checked ? 'short' : 'full')} />
          </div>
          
        </div>
      </div>

      {/* 新闻列表区域 */}
      {newsList.length > 0 && (
        <div className="news-section">
          <div className="news-header">
            <h2>新闻列表 ({newsList.length} 条)</h2>
            <div className="select-actions">
              <button 
                onClick={() => handleSelectAll(true)}
                className="select-all-btn"
              >
                全选
              </button>
              <button 
                onClick={() => handleSelectAll(false)}
                className="select-none-btn"
              >
                取消全选
              </button>
              <span className="selected-count">已选择: {selectedNews.length} 条</span>
            </div>
          </div>
          
          <div className="news-list">
            {newsList.map(news => {
              const isSelected = selectedNews.some(item => item.id === news.id);
              const toggleSelect = () => handleNewsSelect(news, !isSelected);
              const keyToggle = (e) => { if (e.key === 'Enter' || e.key === ' ') toggleSelect(); };
              return (
                <div
                  key={news.id}
                  className={`news-item ${isSelected ? 'selected' : ''}`}
                  onClick={toggleSelect}
                  role="button"
                  tabIndex={0}
                  onKeyDown={keyToggle}
                >
                <div className="news-title-row">
                  <input 
                    type="checkbox" 
                    checked={isSelected}
                    onChange={(e) => handleNewsSelect(news, e.target.checked)}
                    className="news-checkbox"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <h3 className="news-title">
                    {news.link ? (
                      <a href={news.link} target="_blank" rel="noopener noreferrer" className="news-title-link" onClick={(e) => e.stopPropagation()}>
                        {news.title}
                      </a>
                    ) : (
                      news.title
                    )}
                  </h3>
                </div>
                <div className="news-meta">
                  <span className="news-source">来源: {news.source || '未知'}</span>
                  <span className="news-keyword">主关键词: {news.keyword || '未知'}</span>
                  <span className="news-search-keyword">搜索关键词: {news.search_keyword || '未知'}</span>
                  <span className="news-date-prominent">📅 {formatDate(news.fetchdate)}</span>
                  {news.score && (
                    <span 
                      className="news-score-colored"
                      style={getScoreStyle(news.score)}
                    >
                      ⭐ {news.score}分
                    </span>
                  )}
                  {(summaryVersion === 'short' && (news.short_summary || news.content)) && (
                    <span className="short-badge">短</span>
                  )}
                </div>
                <div className="news-summary">
                  {summaryVersion === 'short'
                    ? (news.short_summary || news.content || '')
                    : ((news.content || news.short_summary || '').substring(0, 250) + '...')}
                </div>
              </div>
            );})}
          </div>
        </div>
      )}

      {/* 生成周报按钮 */}
      {newsList.length > 0 && (
        <div className="generate-section">
          <div className="prompt-chooser">
            <div className="prompt-list">
              {(promptOptions && promptOptions.length > 0 ? promptOptions : [{ id: '', name: '默认', description: '使用默认的prompt配置' }]).map(p => {
                const active = selectedPromptId === p.id;
                const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedPromptId(p.id); };
                return (
                  <div
                    key={p.id}
                    className={`prompt-card ${active ? 'selected' : ''}`}
                    onClick={() => setSelectedPromptId(p.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={onKey}
                  >
                    <div className="prompt-card-header">
                      <input
                        type="radio"
                        className="prompt-radio"
                        checked={active}
                        onChange={() => setSelectedPromptId(p.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="prompt-card-title">{p.name}</span>
                    </div>
                    <div className="prompt-card-desc">{p.description || ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <button 
            onClick={handleGenerateReport}
            disabled={isGeneratingReport || isGeneratingKimiReport || selectedNews.length === 0}
            className="generate-btn"
          >
            {isGeneratingReport ? '生成中...' : 'DS生成周报'}
          </button>
          <button 
            onClick={handleGenerateKimiReport}
            disabled={isGeneratingReport || isGeneratingKimiReport || selectedNews.length === 0}
            className="generate-btn kimi-btn"
          >
            {isGeneratingKimiReport ? '生成中...' : 'KIMI生成周报'}
          </button>
        </div>
      )}

      {/* 周报展示区域 */}
  {showReport && (
    <div className="report-section">
      {debugInfo && showModelMessage && (
        <div className="model-message-panel">
          <details open>
            <summary>📤 送给模型的消息</summary>
            <div className="model-message-info">
              <div><span className="label">模型:</span> <span className="value">{debugInfo.model}</span></div>
              {debugInfo.totalChars !== undefined && (
                <div><span className="label">总字符数:</span> <span className="value">{debugInfo.totalChars?.toLocaleString()} 字符</span></div>
              )}
              {debugInfo.estimatedTokens !== undefined && (
                <div><span className="label">预估Token:</span> <span className="value">{debugInfo.estimatedTokens?.toLocaleString()} tokens</span></div>
              )}
              {debugInfo.newsCount && (
                <div><span className="label">新闻数量:</span> <span className="value">{debugInfo.newsCount} 条</span></div>
              )}
            </div>
            <div className="model-message-section">
              <div className="section-header">
                <h3>⚙️ System Prompt</h3>
                <button className="copy-btn-inline" onClick={() => navigator.clipboard.writeText(debugInfo.systemPrompt || '')}>复制</button>
              </div>
              <pre className="model-message-pre">{debugInfo.systemPrompt}</pre>
            </div>
            <div className="model-message-section">
              <div className="section-header">
                <h3>👤 User Prompt</h3>
                <button className="copy-btn-inline" onClick={() => navigator.clipboard.writeText(debugInfo.userPrompt || '')}>复制</button>
              </div>
              <pre className="model-message-pre">{debugInfo.userPrompt}</pre>
            </div>
            <div className="model-message-actions">
              <button className="close-inline" onClick={() => setShowModelMessage(false)}>关闭</button>
            </div>
          </details>
        </div>
      )}
          {/* 状态显示 */}
          {streamingStatus && (
            <div className="streaming-status">
              <div className="status-indicator">
                {isGeneratingReport || isModifying ? (
                  <div className="spinner"></div>
                ) : null}
                <span className="status-text">{streamingStatus}</span>
              </div>
              {canRetry && (
                <button className="retry-btn" onClick={handleRetryGenerate}>
                  🔄 重试
                </button>
              )}
            </div>
          )}

          {/* 思考过程显示 */}
          {streamingReasoning && (
            <div className="reasoning-section">
              <details open>
                <summary>🤔 AI 思考过程</summary>
                <div className="reasoning-content">
                  <pre>{streamingReasoning}</pre>
                </div>
              </details>
            </div>
          )}

          {/* 周报内容 */}
          {(generatedReport || streamingContent) && (
            <>
              <div className="report-header">
                <div className="report-title-container">
                  <h2 className="report-title">🤖 AI新闻周报</h2>
                  <div className="tech-glow"></div>
                </div>
                <div className="report-info">
                  <span>🔑 关键词: {selectedKeyword}</span>
                  <span>📅 时间范围: {formatDate(startDate)} ~ {formatDate(endDate)}</span>
                  <span>📰 新闻数量: {selectedNews.length} 条</span>
                  <span>🤖 模型: {debugInfo?.model || 'DeepSeek R1'}</span>
                  {debugInfo && (
                    <button 
                      className="view-prompts-btn"
                      onClick={() => setShowModelMessage(true)}
                    >
                      🔍 查看送模消息
                    </button>
                  )}
                </div>
              </div>
              <div className="report-content-wrapper">
                <div className="report-content">
                  <ReactMarkdown
                    components={{
                      h1: ({node, ...props}) => <h1 style={{fontSize:'28px',margin:'24px 0 16px 0',color:'#1a2240',fontWeight:800,textAlign:'left',letterSpacing:'0.5px',borderBottom:'2px solid #3d8bfd',paddingBottom:'8px',fontFamily:'inherit',lineHeight:'1.2'}} {...props} />,
                      h2: ({node, ...props}) => <h2 style={{fontSize:'24px',margin:'20px 0 12px 0',color:'#2c3e50',fontWeight:700,textAlign:'left',letterSpacing:'0.3px',fontFamily:'inherit',lineHeight:'1.3'}} {...props} />,
                      h3: ({node, ...props}) => <h3 style={{fontSize:'20px',margin:'16px 0 10px 0',color:'#34495e',fontWeight:600,textAlign:'left',fontFamily:'inherit',lineHeight:'1.4'}} {...props} />,
                      h4: ({node, ...props}) => <h4 style={{fontSize:'18px',margin:'14px 0 8px 0',color:'#5a678a',fontWeight:500,textAlign:'left',fontFamily:'inherit',lineHeight:'1.4'}} {...props} />,
                      ul: ({node, ...props}) => <ul style={{margin:'12px 0 12px 0',paddingLeft:'24px',textAlign:'left',listStyleType:'disc',fontFamily:'inherit'}} {...props} />,
                      ol: ({node, ...props}) => <ol style={{margin:'12px 0 12px 0',paddingLeft:'24px',textAlign:'left',listStyleType:'decimal',fontFamily:'inherit'}} {...props} />,
                      li: ({node, ...props}) => <li style={{margin:'6px 0',textAlign:'left',lineHeight:'1.6',fontFamily:'inherit',display:'list-item'}} {...props} />,
                      strong: ({node, ...props}) => <strong style={{color:'#1a2240',fontWeight:700,fontFamily:'inherit'}} {...props} />,
                      em: ({node, ...props}) => <em style={{color:'#555',fontStyle:'italic',fontFamily:'inherit'}} {...props} />,
                      p: ({node, ...props}) => <p style={{margin:'12px 0',textAlign:'left',lineHeight:'1.7',color:'#333',fontFamily:'inherit',overflowWrap:'break-word',wordWrap:'break-word'}} {...props} />,
                      blockquote: ({node, ...props}) => <blockquote style={{margin:'16px 0',padding:'12px 16px',borderLeft:'4px solid #3d8bfd',background:'#f8f9fa',fontStyle:'italic',color:'#666',fontFamily:'inherit'}} {...props} />,
                      code: ({node, ...props}) => <code style={{background:'#f1f3f4',padding:'2px 6px',borderRadius:'4px',fontSize:'14px',color:'#d73a49',fontFamily:'"SF Mono", Monaco, "Consolas", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace'}} {...props} />,
                      pre: ({node, ...props}) => <pre style={{background:'#f8f9fa',padding:'16px',borderRadius:'8px',overflowX:'auto',fontSize:'14px',lineHeight:'1.5',border:'1px solid #e1e5e9',fontFamily:'"SF Mono", Monaco, "Consolas", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace',whiteSpace:'pre-wrap'}} {...props} />,
                    }}
                  >
                    {generatedReport || streamingContent}
                  </ReactMarkdown>
                  {isGeneratingReport && streamingContent && (
                    <div className="streaming-cursor">▊</div>
                  )}
                </div>
              </div>
              
              {/* 操作按钮 */}
              {generatedReport && !isGeneratingReport && !isModifying && !showModifyInput && modifyRequest === '' && (
                <div className="second-round-actions">
                  <button 
                    className="generate-image-btn"
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || !generatedReport}
                  >
                    {isGeneratingImage ? '🔄 生成中...' : '🎨 制作图片'}
                  </button>
                  <button 
                    className="generate-image-btn"
                    onClick={handleGenerateImageWithContact}
                    disabled={isGeneratingImage || !generatedReport}
                  >
                    {isGeneratingImage ? '🔄 生成中...' : '🎨 制作图片(带联系方式)'}
                  </button>
                </div>
              )}
              
              {/* 修改意见输入区域 */}
              {showModifyInput && (
                <div className="modify-input-section">
                  <h4>请输入您的修改要求：</h4>
                  <textarea
                    value={modifyRequest}
                    onChange={(e) => setModifyRequest(e.target.value)}
                    placeholder="例如：请增加更多风险分析内容，或者请调整第二部分的表述方式..."
                    className="modify-textarea"
                    rows={4}
                  />
                  <div className="modify-actions">
                    <button 
                      className="modify-submit-btn"
                      onClick={handleModifyReport}
                      disabled={isModifying || !modifyRequest.trim()}
                    >
                      {isModifying ? '修改中...' : '提交修改'}
                    </button>
                    <button 
                      className="modify-cancel-btn"
                      onClick={() => {
                        setShowModifyInput(false);
                        setModifyRequest('');
                      }}
                      disabled={isModifying}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Prompt 弹出窗口移除，改用内嵌面板 */}
    </div>
    </ErrorBoundary>
  );
};

export default ReportGenerator;