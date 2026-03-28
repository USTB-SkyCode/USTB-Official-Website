use crate::domain::biome::{BiomeId, get_default_biome_id, get_or_create_biome_id};
use crate::domain::block::{BlockId, BlockModelManager};
use crate::runtime::idmap::Idmap;
use std::cell::RefCell;

pub trait Resolver {
    fn block_id(&self, name: &str, properties: Vec<(String, String)>) -> BlockId;
}

pub trait BiomeResolver {
    fn biome_id(&self, name: &str) -> BiomeId;
    fn default_biome(&self) -> BiomeId;
}

impl Resolver for BlockModelManager {
    fn block_id(&self, name: &str, properties: Vec<(String, String)>) -> BlockId {
        self.get_or_create_id(name, properties)
    }
}

pub struct BiomeGlobal;

impl BiomeResolver for BiomeGlobal {
    fn biome_id(&self, name: &str) -> BiomeId {
        get_or_create_biome_id(name)
    }

    fn default_biome(&self) -> BiomeId {
        get_default_biome_id()
    }
}

pub struct ResolveMap<'a> {
    base: &'a dyn Resolver,
    map: RefCell<Idmap>,
}

impl<'a> ResolveMap<'a> {
    pub fn new(base: &'a dyn Resolver) -> Self {
        Self {
            base,
            map: RefCell::new(Idmap::new()),
        }
    }

    fn key(name: &str, properties: &[(String, String)]) -> String {
        let mut key = String::with_capacity(name.len() + properties.len() * 8);
        key.push_str(name);
        for (prop, value) in properties {
            key.push('|');
            key.push_str(prop);
            key.push('=');
            key.push_str(value);
        }
        key
    }
}

impl Resolver for ResolveMap<'_> {
    fn block_id(&self, name: &str, properties: Vec<(String, String)>) -> BlockId {
        let key = Self::key(name, &properties);
        if let Some(id) = self.map.borrow().get(&key) {
            return id;
        }

        let id = self.base.block_id(name, properties);
        self.map.borrow_mut().insert(key, id);
        id
    }
}
