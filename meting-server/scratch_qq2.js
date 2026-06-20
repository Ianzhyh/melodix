const https = require('https');

function testQQSmartbox(keyword) {
  const url = `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key=${encodeURIComponent(keyword)}`;
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
        if (json.data && json.data.song && json.data.song.itemlist) {
          console.log(`Found ${json.data.song.itemlist.length} songs!`);
          console.log('First song:', json.data.song.itemlist[0].name);
        }
      } catch (e) {
        console.log('Error parsing JSON:', data.slice(0, 500));
      }
    });
  }).on('error', (e) => console.log('Network error:', e));
}

testQQSmartbox('周杰伦');
