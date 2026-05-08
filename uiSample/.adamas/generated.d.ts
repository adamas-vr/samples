
import { Entity } from "@adamasvr/sdk";
import "./asset-type"

declare module "@adamasvr/sdk"{
export interface SceneGraph
{
    "@UI Panel": {
        entityId: Entity
    },
    "@cube": {
        entityId: Entity
    }
}
}

export {}
