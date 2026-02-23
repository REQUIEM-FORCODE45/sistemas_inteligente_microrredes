import React from 'react'

export const getEnvVariables = () => {

    import.meta.env
    return {
        ...import.meta.env,
    }

}
