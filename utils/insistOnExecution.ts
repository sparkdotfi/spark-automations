export const insistOnExecution = async (callToExecute: () => Promise<any>): Promise<any> => {
    try {
        return await callToExecute()
    } catch (error) {
        const { message } = error as any
        if (
            message.includes('Transaction reverted without a reason') ||
            message.includes('Transaction ran out of gas')
        ) {
            return await insistOnExecution(callToExecute)
        } else {
            throw error
        }
    }
}
