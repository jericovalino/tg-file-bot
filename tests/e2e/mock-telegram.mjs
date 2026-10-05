// Test-only stand-in for api.telegram.org so the API routes can be exercised locally without a real bot.
// Not used by the application itself.
import http from "node:http";

const PORT = Number(process.env.MOCK_TG_PORT ?? 8099);
const FILE_BYTES = Buffer.from("hello from telegram storage\n".repeat(100));
let messageId = 100;
export const calls = [];

// user 1 = group owner, 2 = plain member, 3 = not in the group
const MEMBERS = { 1: "creator", 2: "member", 3: "left", 4: "administrator" };

function json(res, body) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
function ok(res, result) {
  json(res, { ok: true, result });
}
function fail(res, code, description) {
  json(res, { ok: false, error_code: code, description });
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const url = new URL(req.url, "http://x");

  if (url.pathname.includes("/file/bot")) {
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : FILE_BYTES.length - 1;
      res.writeHead(206, { "content-range": `bytes ${start}-${end}/${FILE_BYTES.length}`, "content-length": end - start + 1 });
      return res.end(FILE_BYTES.subarray(start, end + 1));
    }
    res.writeHead(200, { "content-length": FILE_BYTES.length });
    return res.end(FILE_BYTES);
  }

  const method = url.pathname.split("/").pop();
  let params = {};
  const ct = req.headers["content-type"] ?? "";
  if (ct.includes("application/json")) params = JSON.parse(raw.toString() || "{}");
  else if (ct.includes("multipart/form-data")) {
    // crude: pull simple text fields out of the multipart body
    const text = raw.toString("latin1");
    for (const m of text.matchAll(/name="([^"]+)"\r\n\r\n([^\r]*)\r\n/g)) params[m[1]] = m[2];
    params.__multipartBytes = raw.length;
  }
  calls.push({ method, params });

  switch (method) {
    case "getMe":
      return ok(res, { id: 999, is_bot: true, first_name: "Files", username: "test_files_bot" });
    case "getChatMember": {
      const status = MEMBERS[params.user_id];
      if (!status) return fail(res, 400, "Bad Request: user not found");
      return ok(res, { status, user: { id: params.user_id, is_bot: false, first_name: "U" } });
    }
    case "sendMessage":
      return ok(res, { message_id: ++messageId, date: 1, chat: { id: params.chat_id, type: "supergroup" }, text: params.text });
    case "sendDocument": {
      const approxSize = Math.max(1, (params.__multipartBytes ?? 1000) - 800);
      return ok(res, {
        message_id: ++messageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: Number(params.chat_id), type: "channel" },
        document: {
          file_id: `doc_${messageId}`,
          file_unique_id: `uniq_${messageId}`,
          file_name: "ignored-by-app.bin",
          mime_type: "application/octet-stream",
          file_size: approxSize,
          thumbnail: { file_id: `thumb_${messageId}`, file_unique_id: `tu_${messageId}`, width: 320, height: 320 },
        },
      });
    }
    case "copyMessage":
      return ok(res, { message_id: ++messageId });
    case "deleteMessage":
      return ok(res, true);
    case "getFile":
      if (params.file_id === "doc_too_big") return fail(res, 400, "Bad Request: file is too big");
      return ok(res, { file_id: params.file_id, file_unique_id: "x", file_size: FILE_BYTES.length, file_path: `documents/${params.file_id}.bin` });
    case "answerCallbackQuery":
    case "setWebhook":
    case "deleteWebhook":
    case "setMyCommands":
    case "setChatMenuButton":
      return ok(res, true);
    default:
      return fail(res, 404, `mock: unknown method ${method}`);
  }
});

server.listen(PORT, () => console.log(`[mock-telegram] listening on ${PORT}`));
