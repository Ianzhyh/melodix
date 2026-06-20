const https = require('https');

function testQQMusicU(keyword) {
  const url = `https://u.y.qq.com/cgi-bin/musicu.fcg`;
  console.log('Fetching', url);
  
  const body = JSON.stringify({
    "req_1": {
      "method": "DoSearchForQQMusicDesktop",
      "module": "music.search.SearchCgiService",
      "param": {
        "num_per_page": 30,
        "page_num": 1,
        "query": keyword,
        "search_type": 0
      }
    }
  });

  const req = https.request(url, {
    method: 'POST',
    headers: {
      'Referer': 'https://y.qq.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Status Code:', res.statusCode);
      try {
        const json = JSON.parse(data);
        console.log('Data:', JSON.stringify(json).slice(0, 500));
        if (json.req_1 && json.req_1.data && json.req_1.data.body && json.req_1.data.body.song) {
          const list = json.req_1.data.body.song.list;
          console.log(`Found ${list.length} songs!`);
          console.log('First song:', list[0].name);
        }
      } catch (e) {
        console.log('Error parsing JSON:', data.slice(0, 500));
      }
    });
  });
  req.on('error', (e) => console.log('Network error:', e));
  req.write(body);
  req.end();
}

testQQMusicU('周杰伦');
