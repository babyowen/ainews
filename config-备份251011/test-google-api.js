#!/usr/bin/env node

/**
 * Google搜索API配置测试脚本
 * 
 * 使用方法:
 * 1. 确保项目根目录有.env文件，包含GOOGLE_API_KEY和GOOGLE_SEARCH_ENGINE_ID
 * 2. 在项目根目录运行: node config/test-google-api.js
 */

require('dotenv').config();

async function testGoogleSearchAPI() {
  console.log('=== Google搜索API配置测试 ===\n');
  
  // 检查环境变量
  const apiKey = process.env.GOOGLE_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  
  console.log('1. 环境变量检查:');
  console.log(`   GOOGLE_API_KEY: ${apiKey ? '✅ 已设置' : '❌ 未设置'}`);
  if (apiKey) {
    console.log(`   密钥长度: ${apiKey.length} 字符`);
    console.log(`   密钥前缀: ${apiKey.substring(0, 10)}...`);
  }
  
  console.log(`   GOOGLE_SEARCH_ENGINE_ID: ${searchEngineId ? '✅ 已设置' : '❌ 未设置'}`);
  if (searchEngineId) {
    console.log(`   搜索引擎ID: ${searchEngineId}`);
  }
  
  if (!apiKey || !searchEngineId) {
    console.log('\n❌ 配置不完整，请检查.env文件');
    process.exit(1);
  }
  
  console.log('\n2. API连接测试:');
  
  try {
    // 构建测试请求
    const baseUrl = 'https://www.googleapis.com/customsearch/v1';
    const params = new URLSearchParams({
      key: apiKey,
      cx: searchEngineId,
      q: '测试搜索',
      num: 1
    });
    
    const testUrl = `${baseUrl}?${params.toString()}`;
    console.log('   正在发起测试请求...');
    
    const response = await fetch(testUrl);
    console.log(`   响应状态: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('   错误详情:', errorText);
      
      // 尝试解析JSON错误
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
          console.log(`   具体错误: ${errorJson.error.code} - ${errorJson.error.message}`);
          
          // 提供常见错误的解决建议
          if (errorJson.error.code === 400) {
            console.log('\n💡 400错误通常表示:');
            console.log('   - API密钥格式不正确');
            console.log('   - 搜索引擎ID不正确');
            console.log('   - 请求参数有误');
          } else if (errorJson.error.code === 403) {
            console.log('\n💡 403错误通常表示:');
            console.log('   - API密钥无效或已过期');
            console.log('   - 该密钥没有访问Custom Search API的权限');
            console.log('   - 超出了API配额');
          } else if (errorJson.error.code === 429) {
            console.log('\n💡 429错误表示请求过于频繁，请稍后再试');
          }
        }
      } catch (parseError) {
        console.log('   无法解析错误响应');
      }
      
      console.log('\n❌ API测试失败');
      process.exit(1);
    }
    
    const data = await response.json();
    console.log('   ✅ API连接成功!');
    
    console.log('\n3. 搜索结果测试:');
    if (data.items && data.items.length > 0) {
      console.log(`   ✅ 找到 ${data.items.length} 个搜索结果`);
      console.log(`   总结果数: ${data.searchInformation?.totalResults || '未知'}`);
      console.log(`   搜索用时: ${data.searchInformation?.searchTime || '未知'} 秒`);
      console.log(`   第一个结果标题: "${data.items[0].title?.substring(0, 50)}..."`);
    } else {
      console.log('   ⚠️  没有找到搜索结果，但API调用成功');
    }
    
    console.log('\n4. 配额信息:');
    console.log('   免费配额: 每天100次搜索请求');
    console.log('   当前测试消耗: 1次请求');
    
    console.log('\n🎉 所有测试通过! Google搜索API配置正确');
    
  } catch (error) {
    console.log(`   ❌ 网络错误: ${error.message}`);
    console.log('\n可能的原因:');
    console.log('   - 网络连接问题');
    console.log('   - Google API服务不可用');
    console.log('   - 防火墙阻止了请求');
    
    process.exit(1);
  }
}

// 检查是否安装了必要的依赖
if (typeof fetch === 'undefined') {
  console.log('正在加载fetch依赖...');
  global.fetch = require('node-fetch');
}

// 运行测试
testGoogleSearchAPI().catch(error => {
  console.error('测试脚本执行失败:', error);
  process.exit(1);
}); 