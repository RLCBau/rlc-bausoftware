import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/projects/:projectId/notes', async (req, res) => {
  const list = await prisma.deliveryNote.findMany({
    where: { projectId: req.params.projectId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(list);
});

router.post('/projects/:projectId/notes', async (req, res) => {
  const { date, supplier, material, quantity, unit, documentNo, lvItemId } = req.body ?? {};
  const row = await prisma.deliveryNote.create({
    data: {
      projectId: req.params.projectId,
      date: date ? new Date(date) : undefined,
      supplier,
      material,
      quantity: Number(quantity) || 0,
      unit,
      documentNo: documentNo ?? null,
      lvItemId: lvItemId ?? null,
    },
  });
  res.json(row);
});

export default router; 


