import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler } from '../http/errors.js';
import { runEvalFromTraces } from '../services/eval-from-traces.js';
import { runGenerationJudge } from '../services/eval-judge.js';
import { runRetrievalEval, runRetrievalEvalCompare } from '../services/eval-run.js';
import type {
  EvalCompareRequest,
  EvalFromTracesRequest,
  EvalJudgeRequest,
  EvalRunRequest,
} from '../types/api.js';

export const evalRouter: ExpressRouter = Router();

evalRouter.post(
  '/run',
  asyncHandler(async (req, res) => {
    const body = req.body as EvalRunRequest;
    const report = await runRetrievalEval(body);
    res.json(report);
  }),
);

evalRouter.post(
  '/compare',
  asyncHandler(async (req, res) => {
    const body = req.body as EvalCompareRequest;
    const report = await runRetrievalEvalCompare(body);
    res.json(report);
  }),
);

evalRouter.post(
  '/judge',
  asyncHandler(async (req, res) => {
    const body = req.body as EvalJudgeRequest;
    const report = await runGenerationJudge(body);
    res.json(report);
  }),
);

evalRouter.post(
  '/from-traces',
  asyncHandler(async (req, res) => {
    const body = req.body as EvalFromTracesRequest;
    const report = await runEvalFromTraces(body);
    res.json(report);
  }),
);
