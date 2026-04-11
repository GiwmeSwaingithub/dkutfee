export default async function handler(req, res) {
  try {
    const { filename, type } = req.query;

    const url = `https://portal.dkut.ac.ke/student/downloadfeestructure?filename=${encodeURIComponent(filename)}&type=${encodeURIComponent(type)}`;

    const response = await fetch(url, {
      headers: {
        "Cookie": process.env.DKUT_COOKIE,
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://portal.dkut.ac.ke/student/"
      }
    });// Vercel Serverless Function

let session = {
  cookie: null,
  lastLogin: 0,
};

// helper: extract cookies cleanly
function extractCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  return setCookieHeader
    .split(",")
    .map(c => c.split(";")[0])
    .join("; ");
}

// STEP 1: get login page (for CSRF + initial cookies)
async function getLoginPage() {
  const res = await fetch("https://portal.dkut.ac.ke/", {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const html = await res.text();
  const cookies = extractCookies(res.headers.get("set-cookie"));

  // try to extract CSRF token (common patterns)
  const tokenMatch =
    html.match(/name="_token"\s+value="([^"]+)"/) ||
    html.match(/name="csrf_token"\s+value="([^"]+)"/);

  const csrfToken = tokenMatch ? tokenMatch[1] : null;

  return { csrfToken, cookies };
}

// STEP 2: login
async function login() {
  const { csrfToken, cookies } = await getLoginPage();
const USERNAME = "nyaga.njogu23@students.dkut.ac.ke";
const PASSWORD = "0711660741@Aa";
  const res = await fetch("https://portal.dkut.ac.ke/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0",
      "Cookie": cookies,
      "Referer": "https://portal.dkut.ac.ke/",
    },
    body: new URLSearchParams({
      username: USERNAME,
password: PASSWORD,
      ...(csrfToken ? { _token: csrfToken } : {}),
    }),
    redirect: "manual", // important for capturing cookies
  });

  const newCookies = extractCookies(res.headers.get("set-cookie"));

  if (!newCookies) throw new Error("Login failed");

  return cookies + "; " + newCookies;
}

// STEP 3: ensure session
async function getSessionCookie() {
  const now = Date.now();

  if (!session.cookie || now - session.lastLogin > 10 * 60 * 1000) {
    session.cookie = await login();
    session.lastLogin = now;
  }

  return session.cookie;
}

// MAIN HANDLER
export default async function handler(req, res) {
  try {
    const { filename, type } = req.query;

    if (!filename || !type) {
      return res.status(400).send("Missing parameters");
    }

    let cookie = await getSessionCookie();

    const url = `https://portal.dkut.ac.ke/student/downloadfeestructure?filename=${encodeURIComponent(
      filename
    )}&type=${encodeURIComponent(type)}`;

    let response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Cookie": cookie,
        "Referer": "https://portal.dkut.ac.ke/student/",
      },
    });

    // retry once if session expired mid-request
    if (!response.ok) {
      cookie = await login();

      response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Cookie": cookie,
        },
      });
    }

    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch file");
    }

    const buffer = await response.arrayBuffer();

    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.pdf"`
    );

    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).send("Auto-login system failed");
  }
}

    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch file");
    }

    const buffer = await response.arrayBuffer();

    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.pdf"`
    );

    res.send(Buffer.from(buffer));

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
}
