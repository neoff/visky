FROM node:24-alpine AS build

ENV YARN_IGNORE_BUILD=true
WORKDIR /app
COPY package.json  ./
COPY yarn.lock  ./
RUN yarn install --frozen-lockfile
COPY . .

#RUN ls -la
RUN yarn generate
RUN yarn test
RUN yarn build
RUN mkdir -p /swagger-static && cp -r node_modules/swagger-ui-dist/* /swagger-static/
RUN npm prune --production

FROM node:24-alpine

WORKDIR /app
COPY --from=build /app/dist ./
COPY --from=build /swagger-static ./node_modules/swagger-ui-dist/
COPY --from=build /app/docs ./docs
#COPY --from=build /app/.env ./
CMD ["node", "index.js"]