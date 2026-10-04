const {analyzeRegionPolicyNews,isPolicyGuidanceNews}=require('./regionNewsAnalysis.cjs');

// Business reports also use existing rules and enforcement cases. Broad words such
// as “股东”, “优化” or “流程” alone cannot establish the kind of evidence.
function analyzeBusinessPolicyNews(news={}) {
  const title=String(news.title||'');
  const heading=`${title}\n${news.short_summary||''}`;
  const body=[news.short_summary,news.content].filter(Boolean).join('\n').trim();
  const result=(includedInAnalysis,filterReason,evidenceKind)=>({includedInAnalysis,filterReason,evidenceKind});
  if (/资本公积|盈余公积|转增股本/.test(heading)) return result(false,'企业财务公积金，与住房公积金无关','financial-reserve');
  if (!body) return result(false,'缺少正文和摘要，请核对原文后决定是否纳入','insufficient-material');
  if (/(?:欠缴|补缴|追缴|骗提|骗贷)/.test(heading) && /公积金/.test(heading) && /案件|案例|纠纷|法院|被执行|责令.{0,15}补缴|查封/.test(heading)) return result(true,'缴存或使用合规案例，不能视为普遍政策','enforcement-case');
  const lead=String(news.short_summary||'').split(/[。\n]/)[0];
  if (/征求意见|征求意见稿|修订稿/.test(title) || (!/施行|实施|生效|落地/.test(title) && /征求意见|征求意见稿|修订稿/.test(lead))) return result(true,'征求意见或草案，不能视为已生效政策','proposed-policy');
  if (/会.{0,12}[吗？?]|是否.{0,12}(?:下调|上调)|预测|猜测|或将|有望/.test(title)) return result(false,'预测或观点材料，缺少已确认政策结论','context');
  const concreteRule=/(?:额度|比例|利率|基数|首付|期限)[^。；\n]{0,24}(?:\d|[一二三四五六七八九十]+(?:成|年|个月))|(?:连续|累计)缴存[^。；\n]{0,15}(?:\d|[一二三四五六七八九十])|(?:新增|取消|放宽)[^。；\n]{0,18}(?:提取情形|代际互助|异地贷款)|(?:申请人|缴存人|借款人|职工)[^。；\n]{0,16}(?:可申请|须提供|需提供|不得|符合)/.test(body);
  const temporaryService=/暂停|停办|服务时间|放假|不打烊/.test(title);
  const substantiveService=/不计(?:算|收)?罚息|不影响[^。；\n]{0,8}征信|还款[^。；\n]{0,16}(?:顺延|延期)|不纳入逾期/.test(body);
  if (temporaryService && !concreteRule && !substantiveService) return result(false,'临时服务安排，未提供具体业务规则','service-notice');
  if (/党组|党代会|党建|调研|志愿服务|现场咨询|宣传活动/.test(title) && !concreteRule) return result(false,'会议、调研或宣传活动，未提供具体业务规则','activity');
  if (substantiveService) return result(true,'服务调整涉及还款或权益规则，请核对适用期限','policy-action');
  // An action notice can mention its handling process without becoming a guide.
  const guidance=isPolicyGuidanceNews(news) || /指南|解读/.test(heading) || /流程/.test(title);
  if (guidance) return result(true,'办理指南或解读，须区分既有规则与明确的新政','existing-rule');
  const analysis=analyzeRegionPolicyNews(news);
  if (analysis.includedInAnalysis) return result(true,'含政策或执行动作，请核对正文及生效时间','policy-action');
  if (concreteRule) return result(true,'具体业务规则，不能仅凭采集日期视为新政','existing-rule');
  return result(false,'未识别到具体政策或办理规则，可核对后人工纳入','context');
}

module.exports={analyzeBusinessPolicyNews};
