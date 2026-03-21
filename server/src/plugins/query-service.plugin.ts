import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { QueryService } from '../services/query.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    queryService: QueryService;
  }
}

const queryServicePlugin: FastifyPluginAsync = async (fastify) => {
  const queryService = new QueryService(fastify.db);
  fastify.decorate('queryService', queryService);
};

export default fp(queryServicePlugin, {
  name: 'query-service',
  fastify: '5.x',
  dependencies: ['db'],
});
