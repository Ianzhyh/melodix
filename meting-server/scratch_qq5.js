const https = require('https');

function testQQSearch(keyword) {
  const url = `https://shc.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=${encodeURIComponent(keyword)}&p=1&n=20&format=json`;
  console.log('Fetching', url);
  
  https.get(url, {
    headers: {
      'Referer': 'https://y.qq.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Status Code:', res.statusCode);
      try {
        const json = JSON.parse(data);
        console.log('Data:', JSON.stringify(json).slice(0, 500));
        if (json.data && json.data.song && json.data.song.list) {
          console.log(`Found ${json.data.song.list.length} songs!`);
        }
      } catch (e) {
        console.log('Error parsing JSON:', data.slice(0, 500));
      }
    });
  }).on('error', (e) => console.log('Network error:', e));
}

testQQSearch('周杰伦');
