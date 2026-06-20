const https = require('https');

function testQQSearch(keyword) {
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=30&w=${encodeURIComponent(keyword)}&format=json&cr=1&new_json=1`;
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
          console.log('First song:', json.data.song.list[0].name);
        }
      } catch (e) {
        console.log('Error parsing JSON:', data.slice(0, 500));
      }
    });
  }).on('error', (e) => console.log('Network error:', e));
}

testQQSearch('周杰伦');
