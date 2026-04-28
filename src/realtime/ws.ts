import { WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'http';

type Client = import('ws').WebSocket;

type Msg =
  | { type: 'job.status'; jobId: string; status: string }
  | { type: 'job.completed'; jobId: string; analysisId?: string | null }
  | { type: 'job.failed'; jobId: string; error?: string };

class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private clientsByJob = new Map<string, Set<Client>>();

  attach(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url ?? '', 'http://localhost');
      const jobId = url.searchParams.get('jobId');
      if (!jobId) {
        ws.close(1008, 'jobId is required');
        return;
      }
      let set = this.clientsByJob.get(jobId);
      if (!set) {
        set = new Set();
        this.clientsByJob.set(jobId, set);
      }
      set.add(ws);

      ws.on('close', () => {
        const s = this.clientsByJob.get(jobId);
        if (!s) return;
        s.delete(ws);
        if (s.size === 0) this.clientsByJob.delete(jobId);
      });
    });
  }

  publishToJob(jobId: string, msg: Msg) {
    const set = this.clientsByJob.get(jobId);
    if (!set) return;
    const payload = JSON.stringify(msg);
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }
}

export const realtimeHub = new RealtimeHub();
