import React from 'react';
import ReactEcharts from 'echarts-for-react';

// 颜色色板
const palette = [
  '#e57373', '#ffd54f', '#64b5f6', '#81c784', '#ba68c8', '#ffb74d', '#4dd0e1', '#a1887f', '#90a4ae', '#f06292'
];

export default function LowScoreChart({ data }) {
  // 横轴为API来源，堆叠为分数，数据可被关键词和分数过滤
  const allApis = Array.from(new Set(data.map(item => item.sourceapi || '无')));
  const allScores = Array.from(new Set(data.map(item => item.score))).sort((a, b) => a - b);
  // 构建series：每个分数一个series，data为各API来源下该分数的总和
  const apiScoreMap = {};
  allApis.forEach(api => {
    apiScoreMap[api] = {};
    allScores.forEach(score => { apiScoreMap[api][score] = 0; });
  });
  data.forEach(item => {
    const api = item.sourceapi || '无';
    const score = item.score;
    apiScoreMap[api][score] += item.count;
  });
  // 计算总和（用于百分比）
  const apiTotalMap = {};
  allApis.forEach(api => {
    apiTotalMap[api] = allScores.reduce((sum, score) => sum + apiScoreMap[api][score], 0);
  });

  const series = allScores.map((score, idx) => ({
    name: `${score}分`,
    type: 'bar',
    stack: 'score',
    data: allApis.map(api => apiScoreMap[api][score]),
    itemStyle: { color: palette[idx % palette.length] }
  }));

  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: params => {
        // params 是每个分数的bar
        let api = params[0]?.axisValueLabel || '';
        let total = apiTotalMap[api] || 1;
        let lines = [`<b>${api}</b><br/>总数: ${total}`];
        params.forEach(item => {
          const percent = total ? ((item.value / total) * 100).toFixed(1) : 0;
          lines.push(
            `<span style='display:inline-block;margin-right:4px;border-radius:3px;width:10px;height:10px;background:${item.color}'></span>` +
            `${item.seriesName}: ${item.value} (${percent}%)`
          );
        });
        return lines.join('<br/>');
      }
    },
    legend: { data: allScores.map(s => `${s}分`) },
    grid: { left: 40, right: 20, bottom: 60, top: 40 },
    xAxis: {
      type: 'category',
      data: allApis,
      axisLabel: { rotate: 30 }
    },
    yAxis: {
      type: 'value',
      name: '数量'
    },
    series
  };

  return (
    <div style={{ background: '#fff', borderRadius: 6, padding: 16 }}>
      <ReactEcharts option={option} style={{ height: 360 }} />
    </div>
  );
} 