# The Expo web export, served by nginx.
#
# The bundle is built OUTSIDE this image (scripts/build-web.sh) rather than in a
# builder stage: the export needs the whole app workspace, its yarn cache and
# its patches, and copying that into a Docker context turns a 40 second build
# into a five minute one for no gain. The image is what it says it is — static
# files plus a server.
FROM nginx:1.27-alpine

# Serve on 8080 so the container needs no root.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY web/ /usr/share/nginx/html/player/

EXPOSE 8080
