import React from 'react';
import ReactEcharts from 'echarts-for-react';

function SourceChart({ data, websites, onBarClick }) {
  // 以 domain 为横轴，count 为纵轴
  const websiteMap = websites.reduce((acc, w) => {
    acc[w.website] = w.name || w.website;
    return acc;
  }, {});
  const xData = data.map(item => websiteMap[item.domain] || item.domain);
  const yData = data.map(item => item.count);

  const option = {
    tooltip: {},
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { rotate: 30 }
    },
    yAxis: {
      type: 'value',
      name: '抓取量'
    },
    series: [
      {
        type: 'bar',
        data: yData,
        itemStyle: { color: '#3d4673' }
      }
    ]
  };

  // 处理点击事件
  const onEvents = {
    click: (params) => {
      if (onBarClick && data[params.dataIndex]) {
        onBarClick(data[params.dataIndex].domain);
      }
    }
  };

  return (
    <div style={{ background: '#fff', borderRadius: 6, padding: 16 }}>
      <ReactEcharts option={option} style={{ height: 320 }} onEvents={onEvents} />
    </div>
  );
}

export default React.memo(SourceChart, (prevProps, nextProps) => {
  return (
    prevProps.data === nextProps.data &&
    prevProps.websites === nextProps.websites
  );
}); 