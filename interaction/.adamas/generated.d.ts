
import { Entity } from "@adamasvr/sdk";
import "./asset-type"

declare module "@adamasvr/sdk"{
export interface SceneGraph
{
    "@Network Grabble": {
        entityId: Entity,
        "@Hovered": {
            entityId: Entity
        },
        "@Selected": {
            entityId: Entity
        },
        "@Activated": {
            entityId: Entity
        }
    },
    "@Display": {
        entityId: Entity
    },
    "@Collision": {
        entityId: Entity
    },
    "@Trigger": {
        entityId: Entity
    }
}
}

export {}
