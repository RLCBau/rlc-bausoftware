import { Router } from 'express';
import { prisma } from '../lib/prisma';

const r = Router();

r.get('/projects/:projectId/lv-items', async (req, res) => {
  const items = await prisma.lVItem.findMany({
    where: { projectId: req.params.projectId },
    orderBy: [{ positionNumber: 'asc' }],
  });
  res.json(items);
});

r.get('/lv-items/:id', async (req, res) => {
  const item = await prisma.lVItem.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

r.put('/lv-items/:id', async (req, res) => {
  const { calcExpression, calcVariables, calcResult, quantity, unitPrice } = req.body ?? {};
  const updated = await prisma.lVItem.update({
    where: { id: req.params.id },
    data: {
      calcExpression: calcExpression ?? undefined,
      calcVariables: typeof calcVariables === 'string' ? calcVariables : JSON.stringify(calcVariables ?? {}),
      calcResult: typeof calcResult === 'number' ? calcResult : undefined,
      quantity: typeof quantity === 'number' ? quantity : undefined,
      unitPrice: typeof unitPrice === 'number' ? unitPrice : undefined,
    },
  });
  res.json(updated);
});

export default r;




