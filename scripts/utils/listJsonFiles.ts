import fs from 'fs'
import path from 'path'

export const listJsonFiles = (srcPath: string): string[] => {
    return fs
        .readdirSync(srcPath)
        .filter((file) => fs.statSync(path.join(srcPath, file)).isFile())
        .filter((file) => file.endsWith('.json'))
}
