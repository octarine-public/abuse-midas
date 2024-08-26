import "./translations"

import {
	AbilityData,
	DOTA_CHAT_MESSAGE,
	DOTAScriptInventorySlot,
	dotaunitorder_t,
	Entity,
	EventsSDK,
	ExecuteOrder,
	GameState,
	Hero,
	ImageData,
	item_hand_of_midas,
	LocalPlayer,
	Menu,
	NetworkedParticle,
	PhysicalItem,
	PlayerCustomData,
	TickSleeper
} from "github.com/octarine-public/wrapper/index"

new (class CAbuseMidas {
	private isSelled = false
	private isPurchased = false

	private pickItem: Nullable<PhysicalItem>
	private droppedItem: Nullable<item_hand_of_midas>

	private midasName = "item_hand_of_midas"
	private readonly sleeper = new TickSleeper()
	private readonly iconNode = ImageData.GetItemTexture(this.midasName)
	private toolTip =
		"!!! Use own risk and lucky !!!\nFor abuse need Hand Of Midas and 2200 gold"

	private readonly entry = Menu.AddEntry("Utility")
	private readonly menu = this.entry.AddNode(
		"Abuse hand of midas",
		this.iconNode,
		this.toolTip
	)
	private readonly state = this.menu.AddToggle("State", false, this.toolTip)

	constructor() {
		EventsSDK.on("ChatEvent", this.ChatEvent.bind(this))
		EventsSDK.on("GameEnded", this.GameEnded.bind(this))
		EventsSDK.on("GameStarted", this.GameStarted.bind(this))
		EventsSDK.on("EntityCreated", this.EntityCreated.bind(this))
		EventsSDK.on("ParticleCreated", this.ParticleCreated.bind(this))
		EventsSDK.on("EntityDestroyed", this.EntityDestroyed.bind(this))
		EventsSDK.on("PostDataUpdate", this.PostDataUpdate.bind(this))
		EventsSDK.on("PrepareUnitOrders", this.PrepareUnitOrders.bind(this))
		EventsSDK.on("LifeStateChanged", this.LifeStateChanged.bind(this))
		this.state.OnDeactivate(() => this.reset())
	}

	private get delay() {
		return (GameState.InputLag + GameState.IOLag) * 1000
	}

	protected GameEnded() {
		this.reset()
	}

	protected GameStarted() {
		this.reset()
	}

	protected ChatEvent(type: DOTA_CHAT_MESSAGE, value: number, ...args: number[]) {
		if (type !== DOTA_CHAT_MESSAGE.CHAT_MESSAGE_ITEM_PURCHASE || value !== 65) {
			return
		}
		const playerID = args.find(playerId => playerId === LocalPlayer?.PlayerID)
		if (playerID === undefined) {
			return
		}
		const playerData = PlayerCustomData.get(playerID)
		if (playerData === undefined || playerData.IsSpectator) {
			return
		}
		const localData = this.customData()
		if (localData === undefined) {
			return
		}
		const [playerTeamData, localHero] = localData
		if (!this.hasGold(playerTeamData)) {
			return
		}

		this.isPurchased = true

		const stashMidas = localHero.TotalItems.find(
			item => item instanceof item_hand_of_midas
		)
		if (
			stashMidas !== undefined &&
			stashMidas.ItemSlot >= DOTAScriptInventorySlot.DOTA_STASH_SLOT_1 &&
			stashMidas.ItemSlot <= DOTAScriptInventorySlot.DOTA_STASH_SLOT_6
		) {
			localHero.SellItem(stashMidas)
			this.sleeper.Sleep(this.delay)
			this.isSelled = true
		}
	}

	protected PostDataUpdate(dt: number) {
		if (dt === 0 || !this.state.value || this.sleeper.Sleeping) {
			return
		}
		const localData = this.customData()
		if (localData === undefined || this.pickItem === undefined) {
			return
		}
		const [playerData, localHero] = localData
		if (!this.hasGold(playerData)) {
			return
		}
		if (!this.isPurchased) {
			localHero.PurchaseItem(25)
			localHero.PurchaseItem(64)
			this.sleeper.Sleep(this.delay)
			return
		}
		if (this.isSelled) {
			localHero.PickupItem(this.pickItem)
			this.isSelled = false
		}
	}

	protected PrepareUnitOrders(order: ExecuteOrder): void | false {
		if (!order.Issuers.some(unit => unit === LocalPlayer?.Hero)) {
			return
		}
		const localData = this.customData()
		if (localData === undefined) {
			return
		}
		if (localData[1].IsVisibleForEnemies() && localData[1].HPPercent < 3) {
			return
		}
		if (this.pickItem !== undefined) {
			return false
		}
		if (order.OrderType !== dotaunitorder_t.DOTA_UNIT_ORDER_CAST_TARGET) {
			return
		}
		const ability = order.Ability_
		if (ability instanceof item_hand_of_midas && ability.StackCount <= 0) {
			this.droppedItem = ability
		}
	}

	protected EntityCreated(entity: Entity) {
		if (!(entity instanceof PhysicalItem)) {
			return
		}
		const midas = entity.Item
		if (!(midas instanceof item_hand_of_midas)) {
			return
		}
		if (this.droppedItem !== midas) {
			return
		}
		const pLocalData = this.customData()
		if (pLocalData === undefined) {
			return
		}
		if (midas.Owner === pLocalData[1]) {
			this.pickItem = entity
			this.droppedItem = undefined
		}
	}

	protected EntityDestroyed(entity: Entity) {
		if (this.pickItem === entity) {
			this.pickItem = undefined
			this.isPurchased = false
		}
	}

	protected LifeStateChanged(entity: Entity) {
		if (entity === LocalPlayer?.Hero && !entity.IsAlive) {
			this.reset()
		}
	}

	protected ParticleCreated(particle: NetworkedParticle) {
		if (particle.PathNoEcon !== "particles/items2_fx/hand_of_midas.vpcf") {
			return
		}
		const mAttached = particle.ModifiersAttachedTo
		if (mAttached === undefined) {
			return
		}
		const localData = this.customData()
		if (localData === undefined) {
			return
		}
		const [playerData, localHero] = localData
		if (!this.hasGold(playerData) || localHero !== mAttached) {
			return
		}
		if (localHero.IsVisibleForEnemies() && localHero.HPPercent < 3) {
			return
		}
		if (this.droppedItem !== undefined) {
			this.dropMidas(this.droppedItem)
		}
	}

	private dropMidas(midas: item_hand_of_midas) {
		if (!this.state.value) {
			return
		}
		const owner = midas.Owner
		if (owner !== undefined) {
			owner.DropItem(midas, owner.Position)
		}
	}

	private customData(): Nullable<[PlayerCustomData, Hero]> {
		const playerTeamData = PlayerCustomData.Array.find(
			x => x.IsLocalPlayer && !x.IsSpectator
		)
		if (playerTeamData === undefined) {
			return
		}
		const localHero = playerTeamData.Hero
		if (localHero === undefined || !localHero.IsAlive) {
			return
		}
		if (localHero.IsInvulnerable || localHero.IsStunned) {
			return
		}
		return [playerTeamData, localHero]
	}

	private reset() {
		this.isSelled = false
		this.isPurchased = false
		this.pickItem = undefined
		this.droppedItem = undefined
		this.sleeper.ResetTimer()
	}

	private hasGold(playerData: PlayerCustomData) {
		const totalGold = playerData.UnreliableGold + playerData.ReliableGold
		const midasData = AbilityData.GetAbilityByName(this.midasName)
		return midasData !== undefined && midasData.Cost <= totalGold
	}
})()
