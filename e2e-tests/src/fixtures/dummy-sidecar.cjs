const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  const { server, type, id, keywords } = req.query;
  if (server !== 'tencent') {
    return res.status(400).json({ error: 'Unsupported server' });
  }

  if (type === 'search') {
    return res.json([
      {
        id: '35847388',
        name: keywords || '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        pic: `http://localhost:${port}/?server=tencent&type=pic&id=35847388&size=800`,
        url: `http://localhost:${port}/mock-song.mp3`
      }
    ]);
  }

  if (type === 'url') {
    return res.json([
      {
        url: `http://localhost:${port}/mock-song.mp3`
      }
    ]);
  }

  if (type === 'lrc') {
    // Return the encrypted hex lyric text from qrcFixture
    return res.send('7d0e90f006801f32021c30512a3e23cb8eb6fac399d339ba00c2b90fce0ff0b3937a892d93fce43fe184ce918e35d9a53ec12bd294efe293b0148bba31ceb55a3d49f0f79fc9d689fedbed98a2e7f2da157f0deffc6258d8ce92f8162b10acc9701b52ea39949cc83cf456c931d16df843a308d83593ef19f4a15d4ccba45f650527f6ae818a0482a2c76b6036205820f2cec1d4f5bbe59a615d4664bd11e03f8f1f16c06e2ebd41');
  }

  if (type === 'pic') {
    const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': img.length
    });
    return res.end(img);
  }

  return res.status(404).send('Not Found');
});

app.get('/mock-song.mp3', (req, res) => {
  res.send('dummy mp3 binary content');
});

app.listen(port, () => {
  console.log(`Mock sidecar listening on port ${port}`);
});