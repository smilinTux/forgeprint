# Web Steganography Protocol

## Overview

Hide PGP-encrypted messages in plain sight — website HTML comments, CSS properties, invisible elements. Unblockable, unfilterable.

## Technique 1: HTML Comments

### Embedding

```html
<div class="content">
  <p>Publicly visible website content here</p>
  <!--
  SKCOMM:BEGIN:sha256(encrypted_content_hash)
  
  Encrypted PGP block encoded in base64:
  
  eJw9kDEOwjAMRe8z... (truncated)
  
  SKCOMM:END:sha256(encrypted_content_hash)
  -->
</div>
```

### Extraction

```javascript
// Extract from any webpage
const comments = document.createTreeWalker(
  document,
  NodeFilter.SHOW_COMMENT,
  null,
  false
);

let message = '';
while (comments.nextNode()) {
  const comment = comments.currentNode.nodeValue;
  if (comment.includes('SKCOMM:BEGIN:')) {
    message = comment.match(/SKCOMM:BEGIN:[\w]+\n(.+)SKCOMM:END:/s)[1].trim();
    break;
  }
}

// Decode and decrypt
const encrypted = atob(message.replace(/\s/g, ''));
const plaintext = await gpgDecrypt(encrypted);
```

## Technique 2: Zero-Width Characters

```javascript
// Encode text in zero-width spaces
const zeroWidthChars = {
  '0': '\u200B',  // Zero Width Space
  '1': '\u200C',  // Zero Width Non-Joiner
};

// Binary → Zero-width
const text = "Hello";
const binary = text.split('').map(c => c.charCodeAt(0).toString(2)).join(' ');
const encoded = binary.replace(/0/g, '\u200B').replace(/1/g, '\u200C');

// Hide in public text
const carrier = "Welcome" + encoded + " to our site!";

// Extract
const binary = carrier.replace(/[^\u200B\u200C]/g, '')
  .replace(/\u200B/g, '0')
  .replace(/\u200C/g, '1');
const text = binary.match(/.{8}/g).map(b => String.fromCharCode(parseInt(b, 2))).join('');
```

## Technique 3: Image Steganography (LSB)

```javascript
// Embed in least significant bits
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const img = await loadImage('carrier.png');

canvas.width = img.width;
canvas.height = img.height;
ctx.drawImage(img, 0, 0);

const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const data = imageData.data;

// Embed message in LSB of red channel
const message = "Encrypted SKComm payload...";
const binary = message.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join('');

for (let i = 0; i < binary.length; i++) {
  data[i * 4] = (data[i * 4] & 0xFE) | parseInt(binary[i]);
}

ctx.putImageData(imageData, 0, 0);
await saveImage(canvas.toDataURL());
```

## Technique 4: CSS Properties

```css
/* Message hidden in unused CSS */
.skcomm-dead-drop {
  content: "b64_encrypted_message_here_long_enough_for_pgp_block";
  /* This element never displays but CSS loads */
}
```

Extraction:

```javascript
const styles = getComputedStyle(document.querySelector('.skcomm-dead-drop'));
const payload = styles.getPropertyValue('content').replace(/"/g, '');
```

## Distribution

### via CDN

Use Cloudflare Pages for distribution:

```
cdn.skcty.io/
├── index.html      (main dead drop)
├── style.css       (steganographic CSS)
├── logo.png        (image with LSB)
└── .well-known/
    └── skcomm.json (discovery endpoint)
```

### Discovery

```javascript
// Check multiple endpoints
const mirrors = [
  'https://scity.io',
  'https://scity.vercel.app',
  'https://scity.github.io',
  'https://scity.netlify.app',
];

for (const url of mirrors) {
  try {
    const response = await fetch(`${url}/.well-known/skcomm.json`);
    if (response.ok) {
      const { deadDropUrl, lastUpdated } = await response.json();
      if (new Date(lastUpdated) > new Date(Date.now() - 60000)) {
        return deadDropUrl; // Fresh dead drop
      }
    }
  } catch (e) { continue; }
}
```

## Advantages

- **Unblockable**: Looks like normal web traffic
- **CDN advantage**: Distributed globally
- **Plausible deniability**: Just a website with weird comments
- **Free**: GitHub Pages, Vercel, Netlify all free
- **Easy rotation**: Update site frequently

## Disadvantages

- **Requires scraping**: Must download and parse HTML
- **No native search**: Can't query content (it's encrypted anyway)
- **Visible to inspection**: Adversary can view source

## Detection Evasion

- Rotate dead drop URLs every 10 minutes
- Distribute across multiple CDNs
- Use common web frameworks (React, Vue) to obfuscate static HTML
- Embed in analytics or tracking scripts (legitimate-looking)

## Security

- Always encrypt: Even detection yields ciphertext
- Sign messages: Authenticate sender even if intercepted
- Rotate keys: PGP keys rotated monthly
