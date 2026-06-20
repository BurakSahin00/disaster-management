import { spawn } from 'child_process';
import { config } from '../config';

type ValidatorResult = {
  ok: boolean;
  errors?: string[];
  pre?: Record<string, unknown>;
  post?: Record<string, unknown>;
};

export async function validateGeoTiffs(input: {
  prePath: string;
  postPath: string;
}): Promise<void> {
  const script = config.geotiffValidatorPath;

  const args = [script, '--pre', input.prePath, '--post', input.postPath];

  const result = await new Promise<ValidatorResult>((resolve, reject) => {
    const proc = spawn(config.pythonBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('GeoTIFF validation timed out'));
    }, 15_000);

    proc.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
    proc.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (!stdout.trim()) {
        reject(new Error(stderr || `GeoTIFF validator produced no output (exit code ${code})`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ValidatorResult);
      } catch {
        reject(new Error(stderr || 'GeoTIFF validator returned invalid JSON'));
      }
    });
  });

  if (!result.ok) {
    const msg = (result.errors ?? ['GeoTIFF validation failed']).join('; ');
    throw new Error(`Invalid GeoTIFFs: ${msg}`);
  }
}
