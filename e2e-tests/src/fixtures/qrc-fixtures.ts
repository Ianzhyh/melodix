export const qrcFixture = {
  ciphertextBase64: 'fQ6Q8AaAHzICHDBRKj4jy462+sOZ0zm6AMK5D84P8LOTeoktk/zkP+GEzpGONdmlPsEr0pTv4pOwFIu6Mc61Wj1J8PefydaJ/tvtmKLn8toVfw3v/GJY2M6S+BYrEKzJcBtS6jmUnMg89FbJMdFt+EOjCNg1k+8Z9KFdTMukX2UFJ/augYoEgqLHa2A2IFgg8s7B1PW75ZphXUZkvRHgP48fFsBuLr1B',
  
  // Hex representation of the above ciphertext
  ciphertextHex: '7d0e90f006801f32021c30512a3e23cb8eb6fac399d339ba00c2b90fce0ff0b3937a892d93fce43fe184ce918e35d9a53ec12bd294efe293b0148bba31ceb55a3d49f0f79fc9d689fedbed98a2e7f2da157f0deffc6258d8ce92f8162b10acc9701b52ea39949cc83cf456c931d16df843a308d83593ef19f4a15d4ccba45f650527f6ae818a0482a2c76b6036205820f2cec1d4f5bbe59a615d4664bd11e03f8f1f16c06e2ebd41',
  
  decryptedXml: '<?xml version="1.0" encoding="utf-8" ?><LyricInfo LyricContent="[0,2250]测试(0,250) :  (250,200)黄(450,400)俊(850,400)郎(1250,400)&#10;[2250,3000]作曲(0,250) :  (250,200)周(450,400)杰(850,400)伦(1250,400)"/>',
  
  expectedLines: [
    {
      time: 0,
      duration: 2250,
      text: '测试 :  黄俊郎',
      words: [
        { text: '测试', start: 0, duration: 250 },
        { text: ' :  ', start: 250, duration: 200 },
        { text: '黄', start: 450, duration: 400 },
        { text: '俊', start: 850, duration: 400 },
        { text: '郎', start: 1250, duration: 400 }
      ]
    },
    {
      time: 2250,
      duration: 3000,
      text: '作曲 :  周杰伦',
      words: [
        { text: '作曲', start: 0, duration: 250 },
        { text: ' :  ', start: 250, duration: 200 },
        { text: '周', start: 450, duration: 400 },
        { text: '杰', start: 850, duration: 400 },
        { text: '伦', start: 1250, duration: 400 }
      ]
    }
  ]
};
