import * as tls from "tls";

export interface SmtpEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER || "nasaqhq@gmail.com",
  pass: process.env.SMTP_PASS || "fanrsagknymfpybt",
  fromName: "Nasaq Gym Alerts",
};

/**
 * Sends email via SMTP (supporting both port 465 SSL and port 587 STARTTLS)
 * using Node.js built-in modules with zero external dependencies.
 */
export async function sendSmtpEmail(options: SmtpEmailOptions): Promise<boolean> {
  const recipients = Array.isArray(options.to)
    ? options.to
    : options.to.split(",").map((e) => e.trim()).filter(Boolean);

  if (recipients.length === 0) return false;

  const host = SMTP_CONFIG.host;
  const user = SMTP_CONFIG.user;
  const pass = SMTP_CONFIG.pass;

  // Use port 465 direct SSL for highest reliability on serverless/Node environments
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const finish = (result: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    const socket = tls.connect(
      {
        host,
        port: 465,
        rejectUnauthorized: false,
        timeout: 10000,
      },
      () => {
        // Connected to Gmail SSL
      }
    );

    let stage = 0;
    let buffer = "";

    socket.setEncoding("utf-8");

    const sendCommand = (cmd: string) => {
      socket.write(cmd + "\r\n");
    };

    socket.on("data", (data: string) => {
      buffer += data;
      const lines = buffer.split("\r\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line) continue;
        const code = line.substring(0, 3);
        const isLastLineOfReply = line.charAt(3) !== "-";

        if (!isLastLineOfReply) continue;

        if (stage === 0 && code === "220") {
          stage = 1;
          sendCommand(`EHLO ${host}`);
        } else if (stage === 1 && code === "250") {
          stage = 2;
          sendCommand("AUTH LOGIN");
        } else if (stage === 2 && code === "334") {
          stage = 3;
          sendCommand(Buffer.from(user).toString("base64"));
        } else if (stage === 3 && code === "334") {
          stage = 4;
          sendCommand(Buffer.from(pass).toString("base64"));
        } else if (stage === 4 && code === "235") {
          stage = 5;
          sendCommand(`MAIL FROM:<${user}>`);
        } else if (stage === 5 && code === "250") {
          stage = 6;
          // Send all RCPT TO
          for (let i = 0; i < recipients.length; i++) {
            sendCommand(`RCPT TO:<${recipients[i]}>`);
          }
        } else if (stage === 6 && code === "250") {
          stage = 7;
          sendCommand("DATA");
        } else if (stage === 7 && code === "354") {
          stage = 8;
          const boundary = "----=_Part_" + Date.now();
          const rawMessage = [
            `From: "${SMTP_CONFIG.fromName}" <${user}>`,
            `To: ${recipients.join(", ")}`,
            `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString("base64")}?=`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            ``,
            `--${boundary}`,
            `Content-Type: text/plain; charset=UTF-8`,
            `Content-Transfer-Encoding: base64`,
            ``,
            Buffer.from(options.text).toString("base64"),
            ``,
            options.html ? `--${boundary}` : "",
            options.html ? `Content-Type: text/html; charset=UTF-8` : "",
            options.html ? `Content-Transfer-Encoding: base64` : "",
            options.html ? `` : "",
            options.html ? Buffer.from(options.html).toString("base64") : "",
            options.html ? `` : "",
            `--${boundary}--`,
            `.`,
          ]
            .filter((l) => l !== "")
            .join("\r\n");

          socket.write(rawMessage + "\r\n");
        } else if (stage === 8 && code === "250") {
          stage = 9;
          sendCommand("QUIT");
          finish(true);
        }
      }
    });

    socket.on("error", (err) => {
      console.error("[SMTP Error]", err);
      finish(false);
    });

    socket.on("timeout", () => {
      console.error("[SMTP Timeout]");
      socket.destroy();
      finish(false);
    });

    socket.on("close", () => {
      if (stage < 8) finish(false);
    });
  });
}
