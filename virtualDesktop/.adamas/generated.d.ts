
import { Entity } from "@adamasvr/sdk";
import "./asset-type"

declare module "@adamasvr/sdk"{
export interface SceneGraph
{
    "@Display": {
        entityId: Entity
    },
    "@controller": {
        entityId: Entity
    }
}
}

export {}
