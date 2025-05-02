FROM node as build

WORKDIR /app
COPY package.json  ./
RUN yarn install
COPY . .
#RUN ls -la

#RUN npm run test
RUN yarn build
RUN npm prune --production

FROM node:16-alpine

WORKDIR /app
COPY --from=build /app/dist ./
COPY --from=build /app/package.json ./
COPY --from=build /app/src/middleware/auth.html /middleware/auth.html
COPY --from=build /app/src/middleware/blank.html /middleware/blank.html
#COPY --from=build /app/.env ./
CMD ["node", "index.js"]