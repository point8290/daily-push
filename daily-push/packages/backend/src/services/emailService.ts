import { Resend } from 'resend';
import { config } from '../config';

const resend = new Resend(config.resend.apiKey);

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  await resend.emails.send({
    from: config.resend.fromEmail,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}
