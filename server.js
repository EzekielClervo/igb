// server.js
const express = require('express');
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const util = require('util');

const sleep = util.promisify(setTimeout);
const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Simple UA rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)'
];
const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Retry wrapper for 429s
async function retryRequest(fn, args = [], retries = 3, delayMs = 3000) {
  try {
    return await fn(...args);
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      console.warn(`429 hit—retrying in ${delayMs}ms (${retries} left)`);
      await sleep(delayMs);
      return retryRequest(fn, args, retries - 1, delayMs * 2);
    }
    throw err;
  }
}

// Redirect root to /login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Serve the login form
app.get('/login', (req, res) => {
  res.send(`
    <h1>Instagram Cookie Generator</h1>
    <form method="POST" action="/login">
      <input name="username" placeholder="Username or Email" required /><br><br>
      <input name="password" type="password" placeholder="Password" required /><br><br>
      <button type="submit">Generate Cookies</button>
    </form>
  `);
});

// Handle the form submission
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const jar = new tough.CookieJar();
  const client = wrapper(axios.create({ jar }));

  // Shared headers
  const baseHeaders = () => ({
    'User-Agent': randomUA(),
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
    'X-IG-App-ID': '936619743392459',
    'Connection': 'keep-alive',
    'Referer': 'https://www.instagram.com/accounts/login/'
  });

  try {
    // 1) GET login page → grab csrftoken
    const homeRes = await retryRequest(
      client.get,
      ['https://www.instagram.com/accounts/login/', { headers: baseHeaders() }]
    );
    const rawCookies = homeRes.headers['set-cookie'] || [];
    const csrfCookie = rawCookies.find(c => c.startsWith('csrftoken='));
    if (!csrfCookie) throw new Error('Couldn’t find csrftoken');
    const csrfToken = csrfCookie.split('=')[1].split(';')[0];

    // 2) Wait a bit
    await sleep(1500);

    // 3) POST credentials
    const postData = new URLSearchParams({
      username,
      enc_password: `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${password}`,
      queryParams: '{}',
      optIntoOneTap: 'false'
    });

    const loginRes = await retryRequest(
      client.post,
      [
        'https://www.instagram.com/accounts/login/ajax/',
        postData.toString(),
        {
          headers: {
            ...baseHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRFToken': csrfToken
          }
        }
      ]
    );

    // 4) If successful, extract cookies
    if (loginRes.data.authenticated) {
      const cookies = await jar.getCookies('https://www.instagram.com');
      const needed = cookies.filter(c =>
        ['csrftoken', 'sessionid', 'ds_user_id', 'mid', 'ig_did'].includes(c.key)
      );
      const cookieString = needed.map(c => `${c.key}=${c.value}`).join('; ');
      return res.send(`<h2>Your Cookies:</h2><pre>${cookieString}</pre>`);
    } else {
      return res.send('<h2>Login failed:</h2> Invalid credentials.');
    }

  } catch (err) {
    console.error('Error:', err.response?.status, err.message);
    if (err.response?.status === 429) {
      return res.send('<h2>Rate limited (429)</h2>Please try again later.');
    }
    return res.send(`<h2>Error:</h2><pre>${err.message}</pre>`);
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
