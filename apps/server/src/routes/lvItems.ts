import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireProjectMember } from '../middleware/guards';

const r = Router();

r.get('/projects/:projectId/lv-items', requireProjectMember('projectId'), async (req, res) => {
  const items = await prisma.lVItem.findMany({
    where: { projectId: String((req as any).resolvedProjectId || req.params.projectId) },
    orderBy: [{ positionNumber: 'asc' }],
  });
  res.json(items);
});

r.get('/lv-items/:id', async (req: any, res) => {
  const item = await prisma.lVItem.findUnique({
    where: { id: req.params.id },
    select: { id: true, projectId: true, positionNumber: true, shortText: true, longText: true, unit: true, quantity: true, unitPrice: true, calcExpression: true, calcVariables: true, calcResult: true },
  });
  if (!item) return res.status(404).json({ error: 'Not found' });

  req.params.projectId = item.projectId;
  return requireProjectMember('projectId')(req, res, () => res.json(item));
});

r.put('/lv-items/:id', async (req: any, res) => {
  const existing = await prisma.lVItem.findUnique({
    where: { id: req.params.id },
    select: { id: true, projectId: true },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  req.params.projectId = existing.projectId;
  return requireProjectMember('projectId')(req, res, async () => {
    const { calcExpression, calcVariables, calcResult, quantity, unitPrice } = req.body ?? {};
    const updated = await prisma.lVItem.update({
      where: { id: existing.id },
      data: {
        calcExpression: calcExpression ?? undefined,
        calcVariables: typeof calcVariables === 'string' ? calcVariables : JSON.stringify(calcVariables ?? {}),
        calcResult: typeof calcResult === 'number' ? calcResult : undefined,
        quantity: typeof quantity === 'number' ? quantity : undefined,
        unitPrice: typeof unitPrice === 'number' ? unitPrice : undefined,
      },
    });
    return res.json(updated);
  });
});

export default r;




