import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import html2canvas from 'html2canvas';
import {
  fetchHistoryReports,
  fetchReportDetail,
  deleteReport,
  fetchReportKeywords
} from '../api/reports';
import './HistoryReports.css';

const HistoryReports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // 筛选条件
  const [filters, setFilters] = useState({
    keyword: '',
    startDate: '',
    endDate: '',
    model: ''
  });

  const [keywords, setKeywords] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [exportingId, setExportingId] = useState(null);
  const [pdfExportingId, setPdfExportingId] = useState(null);

  useEffect(() => {
    loadKeywords();
    loadReports();
  }, [pagination.page]);

  const loadKeywords = async () => {
    try {
      const data = await fetchReportKeywords();
      setKeywords(data);
    } catch (error) {
      console.error('加载关键词失败:', error);
    }
  };

  const loadReports = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      };

      // 移除空值
      Object.keys(params).forEach(key => {
        if (params[key] === '') {
          delete params[key];
        }
      });

      const response = await fetchHistoryReports(params);
      setReports(response.data);
      setPagination(response.pagination);
    } catch (error) {
      console.error('加载周报失败:', error);
      alert('加载周报失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    loadReports();
  };

  const handleReset = () => {
    setFilters({
      keyword: '',
      startDate: '',
      endDate: '',
      model: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
    setTimeout(() => loadReports(), 0);
  };

  const handleViewDetail = async (id) => {
    try {
      const data = await fetchReportDetail(id);
      setSelectedReport(data);
      setShowDetailModal(true);
    } catch (error) {
      console.error('加载详情失败:', error);
      alert('加载详情失败: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这份周报吗？')) return;

    try {
      await deleteReport(id);
      alert('删除成功');
      loadReports();
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败: ' + error.message);
    }
  };

  // 根据关键词生成标题
  const getReportTitle = (keyword) => {
    if (keyword === '江苏省国资委') {
      return '省属国企新闻周报';
    }
    return `${keyword}新闻周报`;
  };

  // 格式化日期函数
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
  };

  // 解析Markdown为HTML（与ReportGenerator保持一致）
  const parseMarkdownToHTML = (markdownContent) => {
    if (!markdownContent) {
      return '<p style="margin: 16px 0; text-align: left; line-height: 1.6; color: #999; font-family: \'PingFang SC\', \'Microsoft YaHei\', \'Helvetica Neue\', Arial, sans-serif; font-size: 36px;">暂无内容</p>';
    }

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

  // 创建PDF样式的HTML（与ReportGenerator保持一致）
  const createPDFStyleHTML = (report) => {
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
          ">${getReportTitle(report.keyword)}</h1>

          <!-- 副标题 -->
          <div style="
            margin: 0 0 18px 0;
          ">
            <span style="
              font-size: 32px;
              color: #ffffff;
              letter-spacing: 0.5px;
              font-weight: 400;
            ">AI新闻总结</span>
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
            <span>时间：${formatDate(report.start_date)} - ${formatDate(report.end_date)}</span>
            <span style="color: #b3c6ff;">|</span>
            <span>AI挑选新闻：${report.news_count} 条</span>
            <span style="color: #b3c6ff;">|</span>
            <span>大模型：${getModelShortName(report.model_used)}</span>
          </div>
        </div>

        <!-- 正文区块 -->
        <div style="
          background: #fff;
          padding: 24px 60px 32px 60px;
          margin: 0;
          display: block;
        ">
          ${parseMarkdownToHTML(report.report_content)}
        </div>
      </div>
    `;
  };

  const handleExportImage = async (report) => {
    setExportingId(report.id);
    try {
      console.log('=== 图片生成开始 ===');
      console.log('传入的report对象:', report);
      console.log('report.report_content是否存在:', !!report.report_content);
      console.log('report.report_content类型:', typeof report.report_content);
      console.log('report.report_content长度:', report.report_content?.length);

      // 检查是否有完整内容，如果没有则先获取
      let fullReport = report;

      if (!report.report_content || report.report_content.length < 1000) {
        console.log('内容不完整，从服务器获取完整内容...');
        fullReport = await fetchReportDetail(report.id);
        console.log('获取到的完整报告:', fullReport);
        console.log('完整报告的report_content长度:', fullReport.report_content?.length);
      }

      if (!fullReport) {
        throw new Error('报告数据不存在');
      }

      if (!fullReport.report_content) {
        throw new Error('报告内容为空');
      }

      // 创建临时元素
      const tempElement = document.createElement('div');
      tempElement.style.position = 'absolute';
      tempElement.style.left = '-9999px';
      tempElement.style.top = '0';
      tempElement.style.width = '1080px';
      tempElement.style.height = 'auto';
      tempElement.style.zIndex = '-1';
      tempElement.style.visibility = 'visible';
      tempElement.style.background = '#f6f8fa';

      console.log('准备生成HTML...');
      // 设置HTML内容（使用ReportGenerator的样式）
      const htmlContent = createPDFStyleHTML(fullReport);
      console.log('HTML内容长度:', htmlContent.length);

      tempElement.innerHTML = htmlContent;

      document.body.appendChild(tempElement);

      // 等待渲染完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 添加联系人信息
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

      // 获取内容高度
      const contentHeight = tempElement.scrollHeight;
      console.log('实际内容高度:', contentHeight);

      // 生成图片
      console.log('开始调用html2canvas...');
      const canvas = await html2canvas(tempElement, {
        useCORS: true,
        allowTaint: false,
        scale: 2,
        backgroundColor: '#f6f8fa'
      });
      console.log('html2canvas完成，canvas尺寸:', canvas.width, 'x', canvas.height);

      document.body.removeChild(tempElement);

      canvas.toBlob((blob) => {
        console.log('=== 开始下载图片 ===');
        console.log('Blob大小:', blob.size, 'bytes');

        const url = URL.createObjectURL(blob);
        console.log('创建的Blob URL:', url);

        const link = document.createElement('a');
        link.href = url;

        // 使用与ReportGenerator一致的命名方式
        const modelShortName = getModelShortName(fullReport.model_used);
        const today = new Date().toISOString().split('T')[0];
        const filename = `AI新闻周报_${fullReport.keyword}_${modelShortName}_${today}_含联系方式.png`;

        console.log('模型简称:', modelShortName);
        console.log('今天日期:', today);
        console.log('完整文件名:', filename);
        console.log('关键词:', fullReport.keyword);

        link.download = filename;
        console.log('link.download 设置为:', link.download);

        // 重要：将link添加到DOM，确保浏览器正确处理download属性
        document.body.appendChild(link);
        console.log('link已添加到DOM');

        console.log('准备触发下载...');
        link.click();

        console.log('下载已触发，移除link元素');
        document.body.removeChild(link);

        setTimeout(() => {
          URL.revokeObjectURL(url);
          console.log('Blob URL 已释放');
        }, 100);

        setExportingId(null);
        console.log('=== 图片生成完成 ===');
      }, 'image/png');
    } catch (error) {
      console.error('=== 导出图片失败 ===');
      console.error('错误信息:', error.message);
      console.error('错误堆栈:', error.stack);
      alert('导出图片失败: ' + error.message);
      setExportingId(null);
    }
  };

  const getModelShortName = (model) => {
    if (model.includes('deepseek-reasoner')) return 'DeepSeek R1';
    if (model.includes('kimi')) return 'KIMI K2';
    if (model.includes('DeepSeek-R1')) return 'SiliconFlow';
    return model;
  };

  const getDownloadFilenameFromDisposition = (headerValue, fallbackName) => {
    if (!headerValue) return fallbackName;
    const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try { return decodeURIComponent(utf8Match[1]); } catch { return fallbackName; }
    }
    const quotedMatch = headerValue.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) return quotedMatch[1];
    const plainMatch = headerValue.match(/filename=([^;]+)/i);
    if (plainMatch?.[1]) return plainMatch[1].trim();
    return fallbackName;
  };

  const getApiErrorMessage = (rawText, fallbackMessage) => {
    if (!rawText) return fallbackMessage;
    const trimmedText = rawText.trim();
    try {
      const errorData = JSON.parse(trimmedText);
      return errorData.details || errorData.error || fallbackMessage;
    } catch {
      const preMatch = trimmedText.match(/<pre>([\s\S]*?)<\/pre>/i);
      const normalizedText = (preMatch?.[1] || trimmedText)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();
      if (normalizedText.includes('Cannot POST')) {
        return 'PDF导出服务未启动，请联系管理员';
      }
      return normalizedText || fallbackMessage;
    }
  };

  const handleGeneratePdf = async (report, includeContact = false) => {
    setPdfExportingId(report.id);
    try {
      let fullReport = report;
      if (!report.report_content || report.report_content.length < 1000) {
        fullReport = await fetchReportDetail(report.id);
      }
      if (!fullReport || !fullReport.report_content) {
        throw new Error('报告内容为空');
      }

      const modelShortName = getModelShortName(fullReport.model_used);
      const contactSuffix = includeContact ? '_带联系方式' : '';
      const fallbackFilename = `AI新闻周报_${fullReport.keyword}_${modelShortName}${contactSuffix}_${new Date().toISOString().split('T')[0]}.pdf`;

      const response = await fetch('/api/reports/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: fullReport.keyword,
          startDate: fullReport.start_date,
          endDate: fullReport.end_date,
          newsCount: fullReport.news_count,
          modelName: modelShortName,
          reportContent: fullReport.report_content,
          includeContact,
        }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        const errorText = await response.text();
        if (errorText) errorMessage = getApiErrorMessage(errorText, errorMessage);
        throw new Error(errorMessage);
      }

      const pdfBlob = await response.blob();
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const filename = getDownloadFilenameFromDisposition(
        response.headers.get('content-disposition'),
        fallbackFilename
      );

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('生成PDF失败:', error);
      alert(`生成PDF失败: ${error.message}`);
    } finally {
      setPdfExportingId(null);
    }
  };

  const truncateContent = (content, maxLength = 150) => {
    if (!content) return '';
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const formatDateRange = (startDate, endDate) => {
    const format = (date) => {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}/${month}/${day}`;
    };
    return `${format(startDate)}-${format(endDate)}`;
  };

  return (
    <div className="history-reports-page kd-page">
      <header className="kd-page-header">
        <div className="history-header-text">
          <div className="kd-page-kicker">HISTORY REPORTS</div>
          <h1 className="kd-page-title">历史周报</h1>
          <p className="kd-page-subtitle">
            查看和管理所有生成的周报
          </p>
        </div>
      </header>

      {/* 筛选区域 */}
      <div className="history-filter-bar kd-panel">
        <div className="history-filter-grid">
          <div className="history-filter-item">
            <label>关键词</label>
            <select
              value={filters.keyword}
              onChange={(e) => handleFilterChange('keyword', e.target.value)}
            >
              <option value="">全部</option>
              {keywords.map(kw => (
                <option key={kw} value={kw}>{kw}</option>
              ))}
            </select>
          </div>

          <div className="history-filter-item">
            <label>开始日期</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
            />
          </div>

          <div className="history-filter-item">
            <label>结束日期</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
            />
          </div>

          <div className="history-filter-item">
            <label>模型</label>
            <select
              value={filters.model}
              onChange={(e) => handleFilterChange('model', e.target.value)}
            >
              <option value="">全部</option>
              <option value="deepseek-reasoner">DeepSeek R1</option>
              <option value="kimi-k2-0905-preview">KIMI K2</option>
              <option value="deepseek-ai/DeepSeek-R1">SiliconFlow</option>
            </select>
          </div>

          <div className="history-filter-actions">
            <button className="history-btn-primary" onClick={handleSearch}>
              搜索
            </button>
            <button className="history-btn-secondary" onClick={handleReset}>
              重置
            </button>
          </div>
        </div>
      </div>

      {/* 表格区域 */}
      <div className="history-table-panel kd-panel">
        {loading ? (
          <div className="kd-state-card loading">
            <span className="spinner"></span>
            <span>加载中…</span>
          </div>
        ) : (
          <>
            <table className="history-table">
              <thead>
                <tr>
                  <th>关键词</th>
                  <th>日期范围</th>
                  <th>新闻数量</th>
                  <th>模型</th>
                  <th>生成时间</th>
                  <th>内容预览</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(report => (
                  <tr key={report.id}>
                    <td>{report.keyword}</td>
                    <td>{formatDateRange(report.start_date, report.end_date)}</td>
                    <td>{report.news_count}</td>
                    <td>{getModelShortName(report.model_used)}</td>
                    <td>{new Date(report.created_at).toLocaleString('zh-CN')}</td>
                    <td className="history-preview-cell">
                      {truncateContent(report.report_preview)}
                    </td>
                    <td className="history-actions-cell">
                      <button
                        className="history-btn-link"
                        onClick={() => handleViewDetail(report.id)}
                      >
                        查看
                      </button>
                      <button
                        className="history-btn-link primary"
                        onClick={() => handleExportImage(report)}
                        disabled={exportingId === report.id}
                      >
                        {exportingId === report.id ? '生成中…' : '生成图片'}
                      </button>
                      <button
                        className="history-btn-link pdf"
                        onClick={() => handleGeneratePdf(report)}
                        disabled={pdfExportingId === report.id}
                      >
                        {pdfExportingId === report.id ? '生成中…' : '生成PDF'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 分页 */}
            <div className="history-pagination">
              <button
                className="history-page-btn"
                disabled={pagination.page === 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              >
                上一页
              </button>
              <span>
                第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 条
              </span>
              <button
                className="history-page-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              >
                下一页
              </button>
            </div>
          </>
        )}
      </div>

      {/* 详情弹窗 */}
      {showDetailModal && selectedReport && (
        <div className="history-modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="history-modal-header">
              <h2>{selectedReport.keyword} - 周报详情</h2>
              <button className="history-modal-close" onClick={() => setShowDetailModal(false)}>
                关闭
              </button>
            </div>
            <div className="history-modal-body">
              <div className="history-modal-meta">
                <p><strong>日期范围:</strong> {selectedReport.start_date} 至 {selectedReport.end_date}</p>
                <p><strong>新闻数量:</strong> {selectedReport.news_count}</p>
                <p><strong>模型:</strong> {getModelShortName(selectedReport.model_used)}</p>
                <p><strong>生成时间:</strong> {new Date(selectedReport.created_at).toLocaleString('zh-CN')}</p>
              </div>
              <div className="history-modal-content">
                <ReactMarkdown>{selectedReport.report_content}</ReactMarkdown>
              </div>
            </div>
            <div className="history-modal-footer">
              <button
                className="history-btn-primary"
                onClick={() => {
                  setShowDetailModal(false);
                  handleExportImage(selectedReport);
                }}
              >
                导出图片(带联系人)
              </button>
              <button
                className="history-btn-primary"
                onClick={() => {
                  setShowDetailModal(false);
                  handleGeneratePdf(selectedReport, true);
                }}
              >
                导出PDF(带联系人)
              </button>
              <button className="history-btn-secondary" onClick={() => setShowDetailModal(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryReports;
