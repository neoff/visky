// src/middleware/error.middleware.ts

import HttpException from "../common/http-exception";
import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  error: HttpException,
  request: Request,
  response: Response,
  next: NextFunction
) => {
  const status = error.statusCode || error.status || 500;
  console.log("-------error-------", error);
  response.status(status);
  response.json({
    message: error.message,
    error: error
  })
};