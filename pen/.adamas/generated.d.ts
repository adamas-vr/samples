
import { Entity } from "@adamasvr/sdk";
import "./asset-type"

declare module "@adamasvr/sdk"{
export interface SceneGraph
{
    "@Pen": {
        entityId: Entity,
        "@Pen Tip": {
            entityId: Entity
        },
        "@Pen Body": {
            entityId: Entity
        }
    }
}
}

export {}
