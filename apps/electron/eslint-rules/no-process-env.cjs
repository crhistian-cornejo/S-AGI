/**
 * ESLint Rule: no-process-env
 *
 * Prevents direct access to process.env in renderer code.
 * Environment variables should be accessed through the preload API.
 *
 * @example
 * // Bad
 * const apiKey = process.env.OPENAI_API_KEY
 *
 * // Good
 * const apiKey = window.desktopApi.getEnv('OPENAI_API_KEY')
 */

module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow direct process.env access in renderer',
            category: 'Security',
            recommended: true,
        },
        fixable: null,
        schema: [],
        messages: {
            noProcessEnv:
                'Do not access process.env directly. Use window.desktopApi for environment access.',
        },
    },

    create(context) {
        return {
            MemberExpression(node) {
                // Check for process.env.* pattern
                if (
                    node.object.type === 'MemberExpression' &&
                    node.object.object.type === 'Identifier' &&
                    node.object.object.name === 'process' &&
                    node.object.property.type === 'Identifier' &&
                    node.object.property.name === 'env'
                ) {
                    context.report({
                        node,
                        messageId: 'noProcessEnv',
                    })
                }

                // Check for process.env pattern (without property access)
                if (
                    node.object.type === 'Identifier' &&
                    node.object.name === 'process' &&
                    node.property.type === 'Identifier' &&
                    node.property.name === 'env'
                ) {
                    context.report({
                        node,
                        messageId: 'noProcessEnv',
                    })
                }
            },
        }
    },
}
