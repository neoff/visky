FROM node:24-alpine as build

WORKDIR /app
COPY package.json  ./
RUN yarn install
COPY . .
#RUN ls -la

#RUN npm run test
RUN yarn build
RUN npm prune --production

FROM node:24-alpine

WORKDIR /app
COPY --from=build /app/dist ./
#COPY --from=build /app/package.json ./
COPY --from=build /app/docs ./docs
#COPY --from=build /app/.env ./
CMD ["node", "index.js"]