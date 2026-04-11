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
    });

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
