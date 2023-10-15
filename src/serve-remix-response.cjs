const { PassThrough, Readable } = require("node:stream")

/** @param {string | Buffer} text */
function createPassThroughStream(text) {
	const readable = new PassThrough()
	readable.push(text)
	readable.push(null)
	return readable
}

/**
 * @param {Electron.ProtocolRequest} request
 * @param {import("@remix-run/server-runtime").RequestHandler} handleRequest
 * @param {import("@remix-run/server-runtime").AppLoadContext | undefined} context
 * @returns {Promise<Electron.ProtocolResponse>}
 */
exports.serveRemixResponse = async function serveRemixResponse(
	request,
	handleRequest,
	context,
) {
	const body = request.uploadData
		? Buffer.concat(request.uploadData.map((data) => data.bytes))
		: undefined

	const remixHeaders = new Headers(request.headers)
	remixHeaders.append("Referer", request.referrer)

	const remixRequest = new Request(request.url, {
		method: request.method,
		headers: remixHeaders,
		body,
	})

	const response = await handleRequest(remixRequest, context)

	/** @type {Record<string, string[]>} */
	const headers = {}
	for (const [key, value] of response.headers) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const values = (headers[key] ??= [])
		values.push(value)
	}

	if (response.body instanceof ReadableStream) {
		return {
			// @ts-expect-error: Argument of type 'ReadableStream<Uint8Array>' is not assignable to parameter of type 'Iterable<any> | AsyncIterable<any>'.
			data: Readable.from(response.body),
			headers,
			statusCode: response.status,
		}
	}

	return {
		data: createPassThroughStream(Buffer.from(await response.arrayBuffer())),
		headers,
		statusCode: response.status,
	}
}
