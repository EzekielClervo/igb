const express = require('express');
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send(`
    <form method="POST" action="/login">
      <input name="username" placeholder="Username/Email"/><br>
      <input name="password" placeholder="Password" type="password"/><br>
      <button>Generate Cookies</button>
    </form>
  `);
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const jar = new tough.CookieJar();
  const client = wrapper(axios.create({ jar }));

  try {
    const homeRes = await client.get("https://www.instagram.com/accounts/login/", {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const csrf = homeRes.headers["set-cookie"].find(c => c.startsWith("csrftoken")).split("=")[1].split(";")[0];

    const loginRes = await client.post("https://www.instagram.com/accounts/login/ajax/", 
      new URLSearchParams({
        username,
        enc_password: `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${password}`,
        queryParams: "{}",
        optIntoOneTap: "false"
      }), {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "X-CSRFToken": csrf,
          "X-Requested-With": "XMLHttpRequest",
          "Referer": "https://www.instagram.com/accounts/login/",
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    if (loginRes.data.authenticated) {
      const cookies = await jar.getCookies("https://www.instagram.com");
      const needed = cookies.filter(c => ["csrftoken", "sessionid", "ds_user_id", "mid", "ig_did"].includes(c.key));
      const cookieStr = needed.map(c => `${c.key}=${c.value}`).join("; ");
      res.send(`<pre>${cookieStr}</pre>`);
    } else {
      res.send("Login failed. Check credentials.");
    }

  } catch (err) {
    console.error(err);
    res.send("Error occurred during login.");
  }
});

app.listen(port, () => {
  console.log(`Running at http://localhost:${port}`);
});
