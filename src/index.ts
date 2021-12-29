import * as sharp from 'sharp';
import fp from 'fastify-plugin';
import { Stream } from 'stream';
import { FastifyInstance } from 'fastify';
import { getFormat, isImage, stream2buffer, supportedFormats } from './utils';

type PluginOptions = {};

export async function fastifyModernImages(fastify: FastifyInstance, opts: PluginOptions) {
    fastify.addHook('onSend', async (request, reply, payload) => {
        const contentType = reply.getHeader('Content-Type') || '';

        if (isImage(contentType)) {
            const oldFormat = getFormat(contentType);

            if (['jpeg', 'webp', 'png'].includes(oldFormat)) {
                let input = payload instanceof Stream ? await stream2buffer(payload) : payload instanceof Buffer ? payload : undefined;
                if (typeof input == 'undefined') {
                    return payload;
                }

                const instance = sharp(input);
                const metadata = await instance.metadata();

                let formats = supportedFormats(request.headers.accept);
                if (metadata.hasAlpha) {
                    formats = formats.filter(format => format.alpha);
                }

                reply.header('Content-Type', `image/${formats[0].format}`);
                return instance.toFormat(formats[0].format as any, formats[0].opts).toBuffer();
            }
        }
    });
}

export default fp(fastifyModernImages, {
    fastify: '3.x',
    name: 'fastify-modern-images'
});
