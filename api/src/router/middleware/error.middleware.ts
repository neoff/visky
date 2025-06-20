// src/middleware/error.middleware.ts

import { Request, Response, NextFunction } from "express";
import HttpException from "@/router/middleware/http-exception";

export const errorHandler = (
  error: HttpException,
  request: Request,
  response: Response,
  next: NextFunction
) => {
  const status = error.statusCode || error.status || 500;
  console.error("-------error-------", error);
  response.status(status);
  response.json({
    message: error.message,
    error: error
  })
};