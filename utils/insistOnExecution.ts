export const insistOnExecution = async (callToExecute: () => Promise<any>): Promise<any> => {
    try {
        return await callToExecute()
    } catch (error) {
        if ((error as any).message.includes('Transaction reverted without a reason')) {
            return await insistOnExecution(callToExecute)
        } else {
            throw error
        }
    }
}
