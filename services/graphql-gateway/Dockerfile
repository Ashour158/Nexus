# Apollo Router for NEXUS GraphQL Federation Gateway
# https://www.apollographql.com/docs/router

FROM ghcr.io/apollographql/router:v1.50.0

COPY router.yaml /dist/config/router.yaml
COPY supergraph.graphql /dist/config/supergraph.graphql

ENV APOLLO_ROUTER_CONFIG_PATH=/dist/config/router.yaml
ENV APOLLO_ROUTER_SUPERGRAPH_PATH=/dist/config/supergraph.graphql

EXPOSE 4000 8088

ENTRYPOINT ["./router"]
