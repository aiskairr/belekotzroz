import { randomUUID } from 'node:crypto';

export class MessageQueue {
  constructor({ waha, delayMs = 5000, minDelayMs = delayMs, maxDelayMs = delayMs }) {
    this.waha = waha;
    this.delayMs = delayMs;
    this.minDelayMs = Math.max(1000, Number(minDelayMs || delayMs));
    this.maxDelayMs = Math.max(this.minDelayMs, Number(maxDelayMs || delayMs));
    this.jobs = new Map();
  }

  createJob({ recipients, textFactory, session, dryRun = false }) {
    const job = {
      id: randomUUID(),
      status: 'queued',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      total: recipients.length,
      sent: 0,
      failed: 0,
      dryRun,
      items: recipients.map((recipient) => ({
        id: randomUUID(),
        recipient,
        status: 'queued',
        message: textFactory(recipient),
        error: '',
        response: null,
        sentAt: null
      }))
    };

    this.jobs.set(job.id, job);
    this.runJob(job, session).catch((error) => {
      job.status = 'failed';
      job.error = error.message;
      job.finishedAt = new Date().toISOString();
    });
    return job;
  }

  getJob(id) {
    return this.jobs.get(id) || null;
  }

  listJobs() {
    return [...this.jobs.values()].map((job) => summarizeJob(job));
  }

  async runJob(job, session) {
    job.status = 'running';
    job.startedAt = new Date().toISOString();

    for (const item of job.items) {
      if (!item.message) {
        item.status = 'skipped';
        item.error = 'Empty message.';
        job.failed += 1;
        continue;
      }

      try {
        if (!job.dryRun) {
          item.response = await this.waha.sendText({
            phone: item.recipient.phone,
            chatId: item.recipient.chatId,
            text: item.message,
            session
          });
        }
        item.status = job.dryRun ? 'dry-run' : 'sent';
        item.sentAt = new Date().toISOString();
        job.sent += 1;
      } catch (error) {
        item.status = 'failed';
        item.error = error.message;
        job.failed += 1;
      }

      await wait(getRandomDelay(this.minDelayMs, this.maxDelayMs));
    }

    job.status = job.failed > 0 ? 'completed_with_errors' : 'completed';
    job.finishedAt = new Date().toISOString();
  }
}

export function summarizeJob(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    total: job.total,
    sent: job.sent,
    failed: job.failed,
    dryRun: job.dryRun
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(minDelayMs, maxDelayMs) {
  if (minDelayMs >= maxDelayMs) return minDelayMs;
  return Math.floor(minDelayMs + Math.random() * (maxDelayMs - minDelayMs + 1));
}
