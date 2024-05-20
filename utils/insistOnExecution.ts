export const insistOnExecution = async (callToExecute: () => Promise<any>, callDepth = 0): Promise<any> => {
    try {
        return await callToExecute()
    } catch (error) {
        const { message } = error as any

        const messageHasAReasonToIgnore =
            message.includes('Transaction reverted without a reason') || message.includes('Transaction ran out of gas')

        if (messageHasAReasonToIgnore && callDepth < 10) {
            return await insistOnExecution(callToExecute, callDepth + 1)
        }

        throw error
    }
}
