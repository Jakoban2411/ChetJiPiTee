#pragma once

#include <array>
#include <cstdint>
#include <deque>
#include <functional>
#include <optional>
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

namespace havoc {

struct Vec3 {
    float x{}, y{}, z{};
    Vec3 operator+(const Vec3& rhs) const;
    Vec3 operator-(const Vec3& rhs) const;
    Vec3 operator*(float scalar) const;
    Vec3& operator+=(const Vec3& rhs);
    [[nodiscard]] float length() const;
    [[nodiscard]] Vec3 normalized() const;
};

struct AABB {
    Vec3 min, max;
    [[nodiscard]] bool intersects(const AABB& other) const;
    [[nodiscard]] bool contains(const Vec3& point) const;
};

using EntityId = std::uint32_t;

enum class Faction { Player, Civilian, Gang, Police };
enum class NpcState { Idle, Wander, Converse, Investigate, Flee, Combat, Injured, Dead };
enum class Weather { Clear, Overcast, Rain, Storm };
enum class AudioCue { Footstep, EngineStart, EngineLoop, Brake, Gunshot, Empty, Hit, Explosion, Splash, Siren, MissionStart, MissionComplete, Dialogue };
enum class WeaponType { Fists, Bat, Pistol, Smg, Shotgun, Rifle, RocketLauncher };

struct WeaponDefinition {
    WeaponType type{WeaponType::Fists};
    std::string name;
    float damage{};
    float range{};
    float cooldown{};
    int magazine{};
    bool explosive{};
};

struct WeaponInstance {
    WeaponDefinition definition;
    int rounds{};
    int reserve{};
    float cooldownRemaining{};
    [[nodiscard]] bool canFire() const;
    bool fire();
    bool reload();
    void update(float dt);
};

struct Character {
    EntityId id{};
    std::string name;
    Vec3 position{};
    Vec3 velocity{};
    float heading{};
    float health{100.f};
    float armor{};
    float collisionRadius{0.55f};
    Faction faction{Faction::Civilian};
    NpcState state{NpcState::Idle};
    EntityId target{};
    float stateTimer{};
    float animationTime{};
    bool grounded{true};
    std::vector<WeaponInstance> inventory;
    std::size_t selectedWeapon{};

    [[nodiscard]] bool alive() const { return health > 0.f; }
    float applyDamage(float amount, EntityId attacker);
    [[nodiscard]] WeaponInstance* weapon();
};

struct Vehicle {
    EntityId id{};
    std::string name;
    Vec3 position{};
    Vec3 velocity{};
    Vec3 halfExtents{1.1f, .8f, 2.2f};
    float heading{};
    float steering{};
    float engineRpm{};
    float health{500.f};
    EntityId driver{};
    bool boat{}, aircraft{};
};

struct StaticBody {
    EntityId id{};
    AABB bounds{};
    float health{200.f};
    bool destructible{};
    bool active{true};
};

struct AudioEvent {
    AudioCue cue{};
    Vec3 position{};
    float volume{1.f};
    float pitch{1.f};
};

class AudioQueue {
public:
    void emit(AudioCue cue, Vec3 position, float volume = 1.f, float pitch = 1.f);
    [[nodiscard]] std::vector<AudioEvent> drain();
private:
    std::vector<AudioEvent> pending_;
};

struct CrimeEvent { EntityId offender{}, victim{}; Vec3 position{}; float severity{}; };

class PhysicsWorld {
public:
    static constexpr float fixedStep = 1.f / 60.f;
    void addStatic(StaticBody body);
    void disable(EntityId id);
    void step(float dt, std::vector<Character>& characters, std::vector<Vehicle>& vehicles);
    [[nodiscard]] std::optional<EntityId> raycast(Vec3 origin, Vec3 direction, float range,
                                                   const std::vector<Character>& characters,
                                                   EntityId ignore = 0) const;
    [[nodiscard]] const std::vector<StaticBody>& statics() const { return statics_; }
private:
    void resolveCharacter(Character& character) const;
    void resolveVehicle(Vehicle& vehicle) const;
    float accumulator_{};
    std::vector<StaticBody> statics_;
};

struct MissionObjective {
    enum class Type { Reach, Talk, EnterVehicle, Eliminate, CauseDamage, EscapeHeat, Wait };
    Type type{Type::Reach};
    std::string text;
    EntityId target{};
    Vec3 location{};
    float required{1.f};
    float progress{};
    bool complete{};
};

struct Mission {
    std::string id;
    std::string title;
    std::deque<MissionObjective> objectives;
    int cashReward{};
};

class MissionQueue {
public:
    void enqueue(Mission mission);
    void update(float dt, const Character& player, float propertyDamage, int heat,
                const std::vector<Character>& characters);
    void signalTalk(EntityId id);
    void signalVehicle(EntityId id);
    void signalElimination(EntityId id);
    [[nodiscard]] const Mission* active() const;
    [[nodiscard]] const MissionObjective* objective() const;
    [[nodiscard]] std::optional<Mission> takeCompleted();
private:
    void advance();
    std::deque<Mission> queue_;
    std::optional<Mission> completed_;
};

struct CameraKeyframe { Vec3 position{}, target{}; float duration{1.f}; float fov{60.f}; };

class CutsceneDirector {
public:
    void play(std::string id, std::vector<CameraKeyframe> keyframes,
              std::function<void()> onComplete = {});
    void update(float dt);
    void skip();
    [[nodiscard]] bool playing() const { return playing_; }
    [[nodiscard]] CameraKeyframe camera() const;
    [[nodiscard]] const std::string& id() const { return id_; }
private:
    std::string id_;
    std::vector<CameraKeyframe> frames_;
    std::size_t frame_{};
    float elapsed_{};
    bool playing_{};
    std::function<void()> onComplete_;
};

struct Environment {
    float timeOfDay{18.25f};
    Weather weather{Weather::Clear};
    float wetness{};
    float wind{};
    float lightningTimer{};
    void update(float dt, AudioQueue& audio, Vec3 listener);
};

struct InputFrame {
    float moveForward{}, moveRight{}, lookYaw{}, lookPitch{};
    bool sprint{}, jump{}, fire{}, interact{}, enterVehicle{}, reload{};
};

class GameSimulation {
public:
    explicit GameSimulation(std::uint32_t seed = 0xC17u);
    void bootstrap();
    void update(float dt, const InputFrame& input);
    void fireWeapon();
    void interact();
    void spawnCrime(CrimeEvent crime);

    [[nodiscard]] Character& player();
    [[nodiscard]] const Character& player() const;
    [[nodiscard]] std::vector<Character>& characters() { return characters_; }
    [[nodiscard]] const std::vector<Character>& characters() const { return characters_; }
    [[nodiscard]] std::vector<Vehicle>& vehicles() { return vehicles_; }
    [[nodiscard]] const std::vector<Vehicle>& vehicles() const { return vehicles_; }
    [[nodiscard]] PhysicsWorld& physics() { return physics_; }
    [[nodiscard]] MissionQueue& missions() { return missions_; }
    [[nodiscard]] CutsceneDirector& cutscenes() { return cutscenes_; }
    [[nodiscard]] Environment& environment() { return environment_; }
    [[nodiscard]] AudioQueue& audio() { return audio_; }
    [[nodiscard]] int heat() const { return heat_; }
    [[nodiscard]] int cash() const { return cash_; }
    [[nodiscard]] float propertyDamage() const { return propertyDamage_; }

private:
    void simulatePlayer(float dt, const InputFrame& input);
    void simulateNpcs(float dt);
    void simulatePolice(float dt);
    void updateWanted(float dt);
    Character* findCharacter(EntityId id);
    EntityId nextId();

    std::mt19937 random_;
    EntityId nextId_{1};
    EntityId playerId_{};
    std::vector<Character> characters_;
    std::vector<Vehicle> vehicles_;
    PhysicsWorld physics_;
    MissionQueue missions_;
    CutsceneDirector cutscenes_;
    Environment environment_;
    AudioQueue audio_;
    std::deque<CrimeEvent> crimes_;
    int heat_{};
    int cash_{250};
    float propertyDamage_{};
    float wantedCooldown_{};
};

const std::array<WeaponDefinition, 7>& weaponCatalog();
} // namespace havoc
