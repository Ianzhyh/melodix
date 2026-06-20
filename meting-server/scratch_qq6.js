const https = require('https');

function testQQSearch(keyword) {
  const url = `https://shc.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=${encodeURIComponent(keyword)}&p=1&n=2&format=json`;
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
      try {
        const json = JSON.parse(data);
        console.log(JSON.stringify(json.data.song.list[0], null, 2));
      } catch (e) {}
    });
  });
}

testQQSearch('周杰伦');
