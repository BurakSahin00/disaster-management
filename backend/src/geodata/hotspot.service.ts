// backend/src/geodata/hotspot.service.ts
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { config } from '../config';
import { hotspotRepository } from './hotspot.repository';

function resolveHotspotScript(): string {
  const candidates = [
    // Running via tsx (src/geodata/)
    path.resolve(__dirname, '..', '..', '..', 'pipeline', 'hotspot.py'),
    // Running compiled (dist/geodata/)
    path.resolve(__dirname, '..', '..', '..', '..', 'pipeline', 'hotspot.py'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`hotspot.py not found. Tried:\n- ${candidates.join('\n- ')}`);
  }
  return found;
}

export async function computeHotspot(analysisId: string): Promise<{ cellCount: number }> {
  const hasRegions = await hotspotRepository.hasRegions(analysisId);
  if (!hasRegions) {
    throw Object.assign(
      new Error('No region data found for this analysis'),
      { status: 404 },
    );
  }

  const scriptPath = resolveHotspotScript();

  await new Promise<void>((resolve, reject) => {
    let stderr = '';
    const proc = spawn(config.pythonBin, [
      scriptPath,
      '--analysis-id', analysisId,
      '--db-url', config.databaseUrl,
    ]);
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.stdout.on('data', (chunk: Buffer) => { process.stdout.write(chunk); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `hotspot.py exited with code ${code ?? 'unknown'}`));
    });
  });

  const cellCount = await hotspotRepository.countHotspotCells(analysisId);
  return { cellCount };
}

export async function getHotspotGeoJSON(
  analysisId: string,
  bbox4326?: [number, number, number, number],
): Promise<object> {
  const hasData = await hotspotRepository.hasHotspotData(analysisId);
  if (!hasData) {
    throw Object.assign(
      new Error('No hotspot data for this analysis. Call POST /analyses/:id/hotspot first.'),
      { status: 404 },
    );
  }
  return hotspotRepository.getHotspotGeoJSON(analysisId, bbox4326);
}
