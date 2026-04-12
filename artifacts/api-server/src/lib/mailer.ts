import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

let transporter: nodemailer.Transporter | null = null;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for SMTP email sending`);
  }
  return value;
}

function getTransporter(): nodemailer.Transporter {
  if (transporter) {
    return transporter;
  }

  const host = getEnv("SMTP_HOST");
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = getEnv("SMTP_USER");
  const pass = getEnv("SMTP_PASS");
  const secure = (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const connectionTimeout = Number.parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? "10000", 10);
  const greetingTimeout = Number.parseInt(process.env.SMTP_GREETING_TIMEOUT_MS ?? "10000", 10);
  const socketTimeout = Number.parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS ?? "15000", 10);
  const tlsRejectUnauthorized = (process.env.SMTP_TLS_REJECT_UNAUTHORIZED ?? "true").toLowerCase() !== "false";

  if (Number.isNaN(port)) {
    throw new Error("SMTP_PORT must be a valid number");
  }

  if (Number.isNaN(connectionTimeout) || Number.isNaN(greetingTimeout) || Number.isNaN(socketTimeout)) {
    throw new Error("SMTP timeout values must be valid numbers");
  }

  const transportOptions: SMTPTransport.Options = {
    host,
    port,
    secure,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: tlsRejectUnauthorized,
    },
  };

  transporter = nodemailer.createTransport(transportOptions);

  return transporter;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}) {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  if (!from) {
    throw new Error("SMTP_FROM or SMTP_USER must be configured");
  }

  const smtp = getTransporter();
  const sendTimeoutMs = Number.parseInt(process.env.SMTP_SEND_TIMEOUT_MS ?? "20000", 10);
  if (Number.isNaN(sendTimeoutMs)) {
    throw new Error("SMTP_SEND_TIMEOUT_MS must be a valid number");
  }

  const sendPromise = smtp.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("SMTP send timed out"));
    }, sendTimeoutMs);
  });

  await Promise.race([sendPromise, timeoutPromise]);
}
