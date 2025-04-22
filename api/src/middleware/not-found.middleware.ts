import HttpException from "../common/http-exception";
import { Request, Response, NextFunction } from "express";

export const notFoundHandler = (
  error: HttpException,
  request: Request,
  response: Response,
  next: NextFunction
) => {
  const status = error.statusCode || error.status || 404;
  response.status(status);
  response.json({
    message: error.message,
    error: error
  })
  next(error);
};